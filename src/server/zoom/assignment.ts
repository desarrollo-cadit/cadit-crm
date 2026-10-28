import { and, asc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { esGrabacionCorta, MINUTOS_MINIMOS_GRABACION } from "@/lib/recording-duration";
import { debeBorrarse } from "@/lib/recording-purge";
import { loadMatchContext, matchRecording, type MatchContext } from "./matching";
import { inOrgScope } from "./scope";

/**
 * 030 US2/US3 (DV-006, DV-007) — Lo que la adjudicación ESCRIBE.
 *
 * La verdad de la adjudicación vive en `zoom_recording` (estado y modo) y en
 * `zoom_recording_class` (a qué clases va); cada clase recibe su PROYECCIÓN en
 * `class_session.recording_url` (+ `recording_source = 'zoom'`), que es lo que
 * ya leen los portales y la lista de clases: ninguno se toca.
 *
 * 2026-10-28 — Una grabación puede ir a VARIAS clases (grabación compartida:
 * dos grupos en la misma reunión a la misma hora); una clase sigue teniendo a
 * lo sumo UNA grabación. Cada clase se decide por separado con las mismas
 * reglas de siempre.
 *
 * Tres promesas, cada una con test:
 *  - **Un enlace pegado a mano nunca se pisa.** Contra una decisión de una
 *    persona —un enlace pegado a mano o una grabación asignada a mano— la
 *    automática queda "sin_clase", NO en "conflicto" (2026-10-27): la persona
 *    ya decidió, y un "conflicto" ahí volvía en cada sincronización sin forma
 *    de sacarlo. "Conflicto" queda solo entre automáticas (la que tiene la
 *    clase no es desplazada por la nueva). Reemplazar exige una decisión
 *    explícita (`replace`).
 *  - **Una decisión manual nunca la deshace la sincronización** (SC-005): el
 *    matcher saltea toda grabación `manual`.
 *  - **Se limpia solo lo propio**: desasignar borra el enlace de cada clase
 *    solo si vino de Zoom y es el de ESA grabación.
 *
 * Invariante (antes un CHECK, hoy de este módulo): `asignada` ⇔ al menos una
 * clase.
 *
 * Cada operación corre en UNA transacción corta y toma
 * `pg_advisory_xact_lock` sobre las clases involucradas, en orden de id para
 * no interbloquear dos operaciones cruzadas.
 *
 * Este módulo es, junto con las dos rutas de carga manual, el ÚNICO que
 * escribe `recording_url` (`tests/unit/recording-url-escrituras.test.ts`).
 */

export type RecRow = {
  id: string;
  zoomConnectionId: string;
  zoomMeetingId: string;
  hostZoomUserId: string;
  startTime: Date;
  /** Minutos que dice Zoom; `null` = desconocido (no se trata como corta). */
  durationMin: number | null;
  playUrl: string | null;
  /** Las clases a las que está adjudicada (`zoom_recording_class`), en orden de id. */
  classSessionIds: string[];
  assignmentMode: "auto" | "manual";
  assignmentState: "pendiente" | "asignada" | "ambigua" | "conflicto" | "sin_clase";
  candidateClassIds: string[];
  conflictClassSessionId: string | null;
  assignedBy: string | null;
  assignedAt: Date | null;
};

export type ClassRow = {
  id: string;
  canceledAt: Date | null;
  recordingUrl: string | null;
  recordingSource: "manual" | "zoom" | null;
};

type RecPatch = Partial<
  Pick<
    RecRow,
    | "classSessionIds"
    | "assignmentMode"
    | "assignmentState"
    | "candidateClassIds"
    | "conflictClassSessionId"
    | "assignedBy"
    | "assignedAt"
  > & {
    /** Las clases de las que se la soltó al faltar en Zoom (`detachMissing`). */
    missingFromClassSessionIds: string[];
  }
>;

export interface AssignmentTx {
  /** Advisory locks por clase, ya ordenados. */
  lockClasses(ids: string[]): Promise<void>;
  getRecording(id: string): Promise<RecRow | null>;
  /** `FOR UPDATE`. */
  getClass(id: string): Promise<ClassRow | null>;
  recordingOnClass(
    classId: string
  ): Promise<{ id: string; assignmentMode: RecRow["assignmentMode"]; durationMin: number | null } | null>;
  /** Con `classSessionIds` en el parche, REEMPLAZA el conjunto de clases de la grabación. */
  updateRecording(id: string, patch: RecPatch): Promise<void>;
  /**
   * 2026-10-27 — Las AUTOMÁTICAS en "conflicto" con `classId` (salvo
   * `exceptId`) pasan a "sin_clase": una persona acaba de decidir esa clase.
   * Siguen automáticas. Devuelve cuántas.
   */
  releaseConflicts(classId: string, exceptId: string): Promise<number>;
  updateClass(id: string, patch: { recordingUrl: string | null; recordingSource: "manual" | "zoom" | null }): Promise<void>;
}

export type AssignmentDeps = {
  /** Corre `fn` en una transacción corta de la organización. */
  run: <T>(orgId: string, fn: (tx: AssignmentTx) => Promise<T>) => Promise<T>;
  loadContext: (orgId: string, window: { from: Date; to: Date }) => Promise<MatchContext>;
  now: () => Date;
};

/* ============================================================
 * Piezas comunes
 * ============================================================ */

/**
 * Toda decisión nueva —del matcher o de una persona— olvida las clases que se
 * recordaban de cuando la grabación faltó en Zoom: la decisión posterior manda.
 */
const sinClase: RecPatch = {
  classSessionIds: [],
  candidateClassIds: [],
  conflictClassSessionId: null,
  missingFromClassSessionIds: [],
};

/** Un enlace en la clase que no vino de Zoom es de una persona (también los de antes de la 030). */
const esManual = (c: ClassRow) => c.recordingUrl !== null && c.recordingSource !== "zoom";

/**
 * Limpia la clase SOLO si su enlace es el de esta grabación y vino de Zoom.
 * Un enlace que alguien pegó después no se toca.
 */
export async function clearClassIfOwned(
  tx: AssignmentTx,
  rec: Pick<RecRow, "playUrl">,
  classId: string
): Promise<void> {
  const cls = await tx.getClass(classId);
  if (cls && cls.recordingSource === "zoom" && cls.recordingUrl === rec.playUrl) {
    await tx.updateClass(classId, { recordingUrl: null, recordingSource: null });
  }
}

const ordenados = (ids: (string | null)[]) => [...new Set(ids.filter((x): x is string => !!x))].sort();

export { esGrabacionCorta, MINUTOS_MINIMOS_GRABACION };

/**
 * Dos grabaciones AUTOMÁTICAS para la misma clase: gana la más larga. Una
 * decisión manual no se desplaza nunca, y ante un empate se queda la que ya
 * estaba (estable).
 */
function desplazaALaActual(
  nueva: Pick<RecRow, "durationMin">,
  actual: { assignmentMode: RecRow["assignmentMode"]; durationMin: number | null }
): boolean {
  if (actual.assignmentMode !== "auto") return false;
  return (nueva.durationMin ?? 0) > (actual.durationMin ?? 0);
}

/**
 * Le saca UNA clase a otra grabación (porque una persona o una grabación más
 * larga se quedó con esa clase). Si le quedan otras clases —era compartida—
 * sigue asignada a esas, con su modo intacto: la decisión fue sobre esta
 * clase, no sobre las demás. Si era la última, `siEraLaUltima` dice cómo
 * queda. No toca el enlace de la clase: quien la toma lo escribe.
 */
async function quitarClase(tx: AssignmentTx, recordingId: string, classId: string, siEraLaUltima: RecPatch): Promise<void> {
  const otra = await tx.getRecording(recordingId);
  if (!otra) return;
  const restantes = otra.classSessionIds.filter((c) => c !== classId);
  if (restantes.length > 0) {
    await tx.updateRecording(otra.id, { classSessionIds: restantes });
    return;
  }
  await tx.updateRecording(otra.id, { ...sinClase, ...siEraLaUltima });
}

/* ============================================================
 * Automática
 * ============================================================ */

type Veredicto =
  | { kind: "gana"; desplazada: { id: string; durationMin: number | null } | null }
  /** La clase la decidió una persona: esta grabación no va ahí. */
  | { kind: "humana" }
  | { kind: "conflicto" };

/** Lo que esta grabación puede hacer en UNA clase (ya bloqueada). */
async function veredicto(tx: AssignmentTx, rec: RecRow, classId: string): Promise<Veredicto> {
  const cls = await tx.getClass(classId);
  const otra = await tx.recordingOnClass(classId);
  const hayOtra = otra !== null && otra.id !== rec.id;
  // 2026-10-27 — La clase ya la decidió una persona (enlace pegado o
  // grabación asignada a mano): no hay nada que resolver, la competidora
  // queda sin clase. Si quedara en "conflicto", cada sincronización la
  // volvería a poner ahí (y no hay cómo descartarla desde la pantalla).
  if (cls && (esManual(cls) || (hayOtra && otra.assignmentMode === "manual"))) return { kind: "humana" };
  // `!cls`: la clase desapareció entre el contexto y el lock. Se deja como
  // siempre; la próxima corrida ya no la tiene en el contexto y la suelta.
  if (!cls || (hayOtra && !desplazaALaActual(rec, otra))) return { kind: "conflicto" };
  return { kind: "gana", desplazada: hayOtra ? otra : null };
}

async function evaluar(tx: AssignmentTx, rec: RecRow, ctx: MatchContext, now: Date): Promise<RecRow["assignmentState"]> {
  if (esGrabacionCorta(rec.durationMin)) {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "sin_clase" });
    return "sin_clase";
  }
  const match = matchRecording({
    recording: {
      zoomConnectionId: rec.zoomConnectionId,
      meetingId: rec.zoomMeetingId,
      hostZoomUserId: rec.hostZoomUserId,
      startTime: rec.startTime,
    },
    classes: ctx.classes,
    rooms: ctx.rooms,
    tolerance: ctx.tolerance,
  });

  if (match.kind === "ninguna") {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "sin_clase" });
    return "sin_clase";
  }
  if (match.kind === "ambigua") {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "ambigua", candidateClassIds: match.candidateIds });
    return "ambigua";
  }

  // `unica` es el caso de una sola clase; `compartida`, una clase por grupo.
  const clases = ordenados(match.kind === "unica" ? [match.classSessionId] : match.classSessionIds);
  await tx.lockClasses(clases);
  const veredictos: [string, Veredicto][] = [];
  for (const c of clases) veredictos.push([c, await veredicto(tx, rec, c)]);
  const ganadas = veredictos.flatMap(([c, v]) => (v.kind === "gana" ? [[c, v.desplazada] as const] : []));

  // Si no ganó en ninguna, el resultado es el de una sola clase: conflicto
  // (con la primera en orden de id) si alguna lo está, y si no, sin clase.
  // Si ganó en alguna, queda asignada a esas y las demás se pierden en
  // silencio: o las decidió una persona, o ya tienen una grabación igual o
  // más larga — en los dos casos cada clase tiene su grabación.
  if (ganadas.length === 0) {
    const enConflicto = veredictos.find(([, v]) => v.kind === "conflicto");
    if (enConflicto) {
      await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "conflicto", conflictClassSessionId: enConflicto[0] });
      return "conflicto";
    }
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "sin_clase" });
    return "sin_clase";
  }
  if (!rec.playUrl) {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "pendiente" });
    return "pendiente";
  }
  for (const [c, desplazada] of ganadas) {
    if (!desplazada) continue;
    // La desplazada suelta la clase ANTES (índice único: una clase, una
    // grabación). Si le quedan otras clases sigue en esas; si no, corta queda
    // sin clase y si no, en conflicto con esta clase, para que una persona la vea.
    await quitarClase(
      tx,
      desplazada.id,
      c,
      esGrabacionCorta(desplazada.durationMin)
        ? { assignmentState: "sin_clase", assignedAt: null }
        : { assignmentState: "conflicto", conflictClassSessionId: c, assignedAt: null }
    );
  }
  await tx.updateRecording(rec.id, {
    ...sinClase,
    classSessionIds: ganadas.map(([c]) => c),
    assignmentState: "asignada",
    assignedBy: null,
    assignedAt: now,
  });
  for (const [c] of ganadas) await tx.updateClass(c, { recordingUrl: rec.playUrl, recordingSource: "zoom" });
  return "asignada";
}

/**
 * Adjudica UNA grabación según el matcher. Devuelve el estado nuevo, o `null`
 * si no correspondía tocarla (manual, o automática ya asignada: estable).
 */
export async function applyMatch(
  orgId: string,
  recordingId: string,
  ctx: MatchContext,
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<RecRow["assignmentState"] | null> {
  return deps.run(orgId, async (tx) => {
    const rec = await tx.getRecording(recordingId);
    if (!rec || rec.assignmentMode === "manual" || rec.assignmentState === "asignada") return null;
    return evaluar(tx, rec, ctx, deps.now());
  });
}

/**
 * R6 — Una persona pegó un enlace a mano en una clase que tenía una grabación
 * de Zoom adjudicada: decidió otra cosa. Se llama en la MISMA transacción que
 * escribe el enlace manual.
 *
 *  - Si era la ÚNICA clase de la grabación, pasa a `manual/sin_clase` (la
 *    sincronización no la vuelve a poner), como siempre.
 *  - 2026-10-28 — Si era compartida, suelta SOLO esa clase y sigue asignada a
 *    las otras con su modo intacto: la persona decidió sobre esta clase, no
 *    sobre las de los otros grupos. Siendo `asignada`, el matcher no la vuelve
 *    a mirar, así que tampoco vuelve a esta clase.
 */
export async function releaseForManualLink(
  orgId: string,
  classSessionId: string,
  userId: string | null,
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<void> {
  await deps.run(orgId, async (tx) => {
    await tx.lockClasses([classSessionId]);
    // 2026-10-27 — Un enlace pegado a mano también es una decisión: las
    // automáticas en conflicto con esta clase quedan sin clase.
    await tx.releaseConflicts(classSessionId, "");
    const rec = await tx.recordingOnClass(classSessionId);
    if (!rec) return;
    await quitarClase(tx, rec.id, classSessionId, {
      assignmentMode: "manual",
      assignmentState: "sin_clase",
      assignedBy: userId,
      assignedAt: deps.now(),
    });
  });
}

/* ============================================================
 * Manual (US3)
 * ============================================================ */

export type ManualResult =
  | { ok: true }
  | { ok: false; reason: "no_existe" | "clase_cancelada" | "sin_enlace" | "ya_automatica" }
  | {
      ok: false;
      reason: "requiere_reemplazo";
      current: { kind: "manual" | "zoom"; recordingId: string | null };
      /** La (primera) clase que pide reemplazo. */
      classSessionId: string;
    };

/**
 * Asigna la grabación a mano a UNA o VARIAS clases (una por grupo, si es
 * compartida). El conjunto REEMPLAZA al que tenía: las clases que deja se
 * limpian (solo lo propio). Todo o nada: si una clase no existe, está
 * cancelada o pide reemplazo, no se escribe nada.
 */
export async function assignManually(
  orgId: string,
  recordingId: string,
  classSessionIds: string | string[],
  opts: { replace: boolean; userId: string },
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<ManualResult> {
  const pedidas = ordenados(Array.isArray(classSessionIds) ? classSessionIds : [classSessionIds]);
  return deps.run(orgId, async (tx): Promise<ManualResult> => {
    const rec = await tx.getRecording(recordingId);
    if (!rec || pedidas.length === 0) return { ok: false, reason: "no_existe" };
    await tx.lockClasses(ordenados([...rec.classSessionIds, ...pedidas]));
    const filas: ClassRow[] = [];
    for (const c of pedidas) {
      const cls = await tx.getClass(c);
      if (!cls) return { ok: false, reason: "no_existe" };
      if (cls.canceledAt) return { ok: false, reason: "clase_cancelada" };
      filas.push(cls);
    }
    if (!rec.playUrl) return { ok: false, reason: "sin_enlace" };

    const aSoltar: [classId: string, recordingId: string][] = [];
    for (const cls of filas) {
      const otra = await tx.recordingOnClass(cls.id);
      const otraId = otra && otra.id !== rec.id ? otra.id : null;
      const current = otraId
        ? { kind: "zoom" as const, recordingId: otraId }
        : esManual(cls)
          ? { kind: "manual" as const, recordingId: null }
          : null;
      if (current && !opts.replace) return { ok: false, reason: "requiere_reemplazo", current, classSessionId: cls.id };
      if (otraId) aSoltar.push([cls.id, otraId]);
    }

    // Primero se suelta lo que había (índice único: una clase, una grabación).
    // A una compartida se le saca solo esa clase.
    for (const [c, otraId] of aSoltar) {
      await quitarClase(tx, otraId, c, {
        assignmentMode: "manual",
        assignmentState: "sin_clase",
        assignedBy: opts.userId,
        assignedAt: deps.now(),
      });
    }
    for (const c of rec.classSessionIds) {
      if (!pedidas.includes(c)) await clearClassIfOwned(tx, rec, c);
    }
    await tx.updateRecording(rec.id, {
      ...sinClase,
      classSessionIds: pedidas,
      assignmentMode: "manual",
      assignmentState: "asignada",
      assignedBy: opts.userId,
      assignedAt: deps.now(),
    });
    for (const c of pedidas) {
      await tx.updateClass(c, { recordingUrl: rec.playUrl, recordingSource: "zoom" });
      // 2026-10-27 — Las otras automáticas que estaban en conflicto con esta
      // clase quedan sin clase: la persona ya eligió. Siguen automáticas, así
      // que "Volver a automático" no aplica y el matcher las sigue mirando (y
      // ahora las deja sin clase mientras la clase tenga esta decisión).
      await tx.releaseConflicts(c, rec.id);
    }
    return { ok: true };
  });
}

/**
 * Desasigna: la grabación queda `manual/sin_clase` y la sincronización la
 * respeta. Limpia TODAS sus clases (solo lo propio). Sobre una sin clase (en
 * "conflicto" o "ambigua") es el «Descartar» de la pantalla: no hay clase que
 * limpiar.
 */
export async function unassign(
  orgId: string,
  recordingId: string,
  userId: string,
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<ManualResult> {
  return deps.run(orgId, async (tx): Promise<ManualResult> => {
    const rec = await tx.getRecording(recordingId);
    if (!rec) return { ok: false, reason: "no_existe" };
    await tx.lockClasses(ordenados(rec.classSessionIds));
    for (const c of rec.classSessionIds) await clearClassIfOwned(tx, rec, c);
    await tx.updateRecording(rec.id, {
      ...sinClase,
      assignmentMode: "manual",
      assignmentState: "sin_clase",
      assignedBy: userId,
      assignedAt: deps.now(),
    });
    return { ok: true };
  });
}

/** "Volver a automático": suelta la decisión manual y re-evalúa en el acto. */
export async function resetToAuto(
  orgId: string,
  recordingId: string,
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<ManualResult> {
  const previa = await deps.run(orgId, (tx) => tx.getRecording(recordingId));
  if (!previa) return { ok: false, reason: "no_existe" };
  if (previa.assignmentMode !== "manual") return { ok: false, reason: "ya_automatica" };
  const ctx = await deps.loadContext(orgId, { from: previa.startTime, to: previa.startTime });

  return deps.run(orgId, async (tx): Promise<ManualResult> => {
    const rec = await tx.getRecording(recordingId);
    if (!rec) return { ok: false, reason: "no_existe" };
    if (rec.assignmentMode !== "manual") return { ok: false, reason: "ya_automatica" };
    await tx.lockClasses(ordenados(rec.classSessionIds));
    for (const c of rec.classSessionIds) await clearClassIfOwned(tx, rec, c);
    await tx.updateRecording(rec.id, {
      ...sinClase,
      assignmentMode: "auto",
      assignmentState: "pendiente",
      assignedBy: null,
      assignedAt: null,
    });
    await evaluar(
      tx,
      { ...rec, classSessionIds: [], candidateClassIds: [], conflictClassSessionId: null, assignmentMode: "auto", assignmentState: "pendiente" },
      ctx,
      deps.now()
    );
    return { ok: true };
  });
}

/* ============================================================
 * Faltantes en Zoom: desvincular, volver y borrar
 * ============================================================ */

/**
 * Lo que la verificación necesita además de la adjudicación. Interfaz aparte
 * para no obligar a cada almacenamiento de prueba de la adjudicación a
 * implementar el borrado.
 */
export interface MissingTx extends AssignmentTx {
  getMissing(id: string): Promise<{ missingInZoomAt: Date | null; missingFromClassSessionIds: string[] } | null>;
  deleteRecording(id: string): Promise<void>;
}

export type MissingDeps = {
  run: <T>(orgId: string, fn: (tx: MissingTx) => Promise<T>) => Promise<T>;
  now: () => Date;
};

/**
 * Una grabación marcada como faltante en Zoom suelta TODAS sus clases: el
 * enlace de cada clase se limpia SOLO si vino de Zoom y es el de ESTA
 * grabación (`clearClassIfOwned`; un enlace pegado a mano nunca se toca). La
 * grabación queda `sin_clase` recordando las clases, y conserva modo, quién y
 * cuándo para la auditoría hasta que se borre. Devuelve si la desvinculó.
 */
export async function detachMissing(orgId: string, recordingId: string, deps: MissingDeps = dbMissingDeps): Promise<boolean> {
  return deps.run(orgId, async (tx) => {
    const rec = await tx.getRecording(recordingId);
    const faltante = await tx.getMissing(recordingId);
    if (!rec || !faltante?.missingInZoomAt || rec.classSessionIds.length === 0) return false;
    await tx.lockClasses(ordenados(rec.classSessionIds));
    for (const c of rec.classSessionIds) await clearClassIfOwned(tx, rec, c);
    await tx.updateRecording(rec.id, {
      ...sinClase,
      assignmentState: "sin_clase",
      missingFromClassSessionIds: rec.classSessionIds,
    });
    return true;
  });
}

export type Reaparicion = "restaurada" | "no_restaurada" | "automatica";

/**
 * Una grabación que se había soltado por faltar y Zoom volvió a listar.
 *
 *  - **Automática**: no se le fuerzan las clases. La página que la volvió a
 *    traer ya la pasó por el matcher (`adjudicatePage`), que decide con el
 *    cronograma de HOY: puede que la clase haya cambiado o tenga otra.
 *  - **Manual**: la decidió una persona, y el matcher no la mira nunca. Vuelve
 *    a CADA una de sus clases que siga existiendo, no esté cancelada y no
 *    tenga ninguna otra grabación ni un enlace pegado a mano ("restaurada" si
 *    volvió a al menos una); si ninguna está libre, queda `manual/sin_clase`
 *    para que una persona decida. Nunca desplaza a nadie.
 *
 * En los tres casos se olvidan las clases recordadas. `null` = no correspondía
 * (sigue faltando, o no se la había soltado).
 */
export async function restoreReappeared(
  orgId: string,
  recordingId: string,
  deps: MissingDeps = dbMissingDeps
): Promise<Reaparicion | null> {
  return deps.run(orgId, async (tx): Promise<Reaparicion | null> => {
    const rec = await tx.getRecording(recordingId);
    const faltante = await tx.getMissing(recordingId);
    if (!rec || !faltante || faltante.missingInZoomAt || faltante.missingFromClassSessionIds.length === 0) return null;
    const previas = ordenados(faltante.missingFromClassSessionIds);
    const olvidar = () => tx.updateRecording(rec.id, { missingFromClassSessionIds: [] });

    if (rec.assignmentMode === "auto" || rec.classSessionIds.length > 0) {
      await olvidar();
      return "automatica";
    }
    await tx.lockClasses(previas);
    const libres: string[] = [];
    for (const c of previas) {
      const cls = await tx.getClass(c);
      const otra = await tx.recordingOnClass(c);
      if (cls && !cls.canceledAt && cls.recordingUrl === null && !otra) libres.push(c);
    }
    if (libres.length === 0 || !rec.playUrl) {
      await olvidar();
      return "no_restaurada";
    }
    await tx.updateRecording(rec.id, { ...sinClase, classSessionIds: libres, assignmentState: "asignada" });
    for (const c of libres) await tx.updateClass(c, { recordingUrl: rec.playUrl, recordingSource: "zoom" });
    return "restaurada";
  });
}

/**
 * Borra una grabación que falta en Zoom hace `purgeDays` días o más. Antes
 * suelta sus clases (mismo criterio que `detachMissing`) por si la
 * desvinculación no llegó a correr. Lo único que la referencia es
 * `zoom_recording_class`, que se borra en cascada.
 */
export async function purgeMissing(
  orgId: string,
  recordingId: string,
  opts: { purgeDays: number },
  deps: MissingDeps = dbMissingDeps
): Promise<boolean> {
  return deps.run(orgId, async (tx) => {
    const rec = await tx.getRecording(recordingId);
    const faltante = await tx.getMissing(recordingId);
    if (!rec || !faltante || !debeBorrarse(faltante.missingInZoomAt, deps.now(), opts.purgeDays)) return false;
    if (rec.classSessionIds.length > 0) {
      await tx.lockClasses(ordenados(rec.classSessionIds));
      for (const c of rec.classSessionIds) await clearClassIfOwned(tx, rec, c);
    }
    await tx.deleteRecording(rec.id);
    return true;
  });
}

/* ============================================================
 * Implementación sobre la base
 * ============================================================ */

const r = schema.zoomRecording;
const rc = schema.zoomRecordingClass;
const cs = schema.classSession;

function dbTx(orgId: string): MissingTx {
  return {
    async getMissing(id) {
      const [row] = await getDb()
        .select({ missingInZoomAt: r.missingInZoomAt, missingFromClassSessionIds: r.missingFromClassSessionIds })
        .from(r)
        .where(scoped(r.organizationId, orgId, eq(r.id, id)))
        .limit(1);
      return row ?? null;
    },
    async deleteRecording(id) {
      await getDb().delete(r).where(scoped(r.organizationId, orgId, eq(r.id, id)));
    },
    async lockClasses(ids) {
      for (const id of [...ids].sort()) {
        await getDb().execute(sql`select pg_advisory_xact_lock(hashtext(${"rec:" + id}))`);
      }
    },
    async getRecording(id) {
      const [row] = await getDb()
        .select({
          id: r.id,
          zoomConnectionId: r.zoomConnectionId,
          zoomMeetingId: r.zoomMeetingId,
          hostZoomUserId: r.hostZoomUserId,
          startTime: r.startTime,
          durationMin: r.durationMin,
          playUrl: r.playUrl,
          assignmentMode: r.assignmentMode,
          assignmentState: r.assignmentState,
          candidateClassIds: r.candidateClassIds,
          conflictClassSessionId: r.conflictClassSessionId,
          assignedBy: r.assignedBy,
          assignedAt: r.assignedAt,
        })
        .from(r)
        .where(scoped(r.organizationId, orgId, eq(r.id, id)))
        .limit(1)
        .for("update");
      if (!row) return null;
      const clases = await getDb()
        .select({ classSessionId: rc.classSessionId })
        .from(rc)
        .where(scoped(rc.organizationId, orgId, eq(rc.recordingId, id)))
        .orderBy(asc(rc.classSessionId));
      return { ...row, classSessionIds: clases.map((c) => c.classSessionId) };
    },
    async getClass(id) {
      const [row] = await getDb()
        .select({ id: cs.id, canceledAt: cs.canceledAt, recordingUrl: cs.recordingUrl, recordingSource: cs.recordingSource })
        .from(cs)
        .where(scoped(cs.organizationId, orgId, eq(cs.id, id)))
        .limit(1)
        .for("update");
      return row ?? null;
    },
    async recordingOnClass(classId) {
      const [row] = await getDb()
        .select({ id: r.id, assignmentMode: r.assignmentMode, durationMin: r.durationMin })
        .from(rc)
        .innerJoin(r, eq(r.id, rc.recordingId))
        .where(scoped(rc.organizationId, orgId, eq(rc.classSessionId, classId)))
        .limit(1);
      return row ?? null;
    },
    async updateRecording(id, patch) {
      const { classSessionIds, ...columnas } = patch;
      await getDb()
        .update(r)
        .set({ ...columnas, updatedAt: new Date() })
        .where(scoped(r.organizationId, orgId, eq(r.id, id)));
      if (classSessionIds === undefined) return;
      // Reemplazo del conjunto. Quien llama ya soltó estas clases de otras
      // grabaciones; si no, el índice único lo rechaza (y la transacción entera
      // revierte): nunca dos grabaciones en una clase.
      const nuevas = ordenados(classSessionIds);
      await getDb()
        .delete(rc)
        .where(
          scoped(
            rc.organizationId,
            orgId,
            eq(rc.recordingId, id),
            nuevas.length > 0 ? notInArray(rc.classSessionId, nuevas) : undefined
          )
        );
      if (nuevas.length > 0) {
        await getDb()
          .insert(rc)
          .values(nuevas.map((c) => ({ organizationId: orgId, recordingId: id, classSessionId: c })))
          .onConflictDoNothing({ target: [rc.recordingId, rc.classSessionId] });
      }
    },
    async releaseConflicts(classId, exceptId) {
      const filas = await getDb()
        .update(r)
        .set({ assignmentState: "sin_clase", conflictClassSessionId: null, updatedAt: new Date() })
        .where(
          scoped(
            r.organizationId,
            orgId,
            eq(r.conflictClassSessionId, classId),
            eq(r.assignmentState, "conflicto"),
            eq(r.assignmentMode, "auto"),
            ne(r.id, exceptId)
          )
        )
        .returning({ id: r.id });
      return filas.length;
    },
    async updateClass(id, patch) {
      await getDb()
        .update(cs)
        .set({ recordingUrl: patch.recordingUrl, recordingSource: patch.recordingSource, updatedAt: new Date() })
        .where(scoped(cs.organizationId, orgId, and(eq(cs.id, id))));
    },
  };
}

/** Las clases de varias grabaciones en UNA consulta (listado, faltantes). */
export async function classesOfRecordings(orgId: string, recordingIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (recordingIds.length === 0) return out;
  const filas = await getDb()
    .select({ recordingId: rc.recordingId, classSessionId: rc.classSessionId })
    .from(rc)
    .where(scoped(rc.organizationId, orgId, inArray(rc.recordingId, recordingIds)))
    .orderBy(asc(rc.classSessionId));
  for (const f of filas) out.set(f.recordingId, [...(out.get(f.recordingId) ?? []), f.classSessionId]);
  return out;
}

export const dbAssignmentDeps: AssignmentDeps = {
  run: (orgId, fn) => inOrgScope(orgId, () => fn(dbTx(orgId))),
  loadContext: (orgId, window) => inOrgScope(orgId, () => loadMatchContext(orgId, window)),
  now: () => new Date(),
};

export const dbMissingDeps: MissingDeps = {
  run: (orgId, fn) => inOrgScope(orgId, () => fn(dbTx(orgId))),
  now: () => new Date(),
};
