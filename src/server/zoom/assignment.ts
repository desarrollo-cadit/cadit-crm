import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { esGrabacionCorta, MINUTOS_MINIMOS_GRABACION } from "@/lib/recording-duration";
import { debeBorrarse } from "@/lib/recording-purge";
import { loadMatchContext, matchRecording, type MatchContext } from "./matching";
import { inOrgScope } from "./scope";

/**
 * 030 US2/US3 (DV-006, DV-007) — Lo que la adjudicación ESCRIBE.
 *
 * La verdad de la adjudicación vive en `zoom_recording`; la clase recibe su
 * PROYECCIÓN en `class_session.recording_url` (+ `recording_source = 'zoom'`),
 * que es lo que ya leen los portales y la lista de clases: ninguno se toca.
 *
 * Tres promesas, cada una con test:
 *  - **Un enlace pegado a mano nunca se pisa.** La automática marca
 *    "conflicto"; reemplazar exige una decisión explícita (`replace`).
 *  - **Una decisión manual nunca la deshace la sincronización** (SC-005): el
 *    matcher saltea toda grabación `manual`.
 *  - **Se limpia solo lo propio**: desasignar borra el enlace de la clase solo
 *    si vino de Zoom y es el de ESA grabación.
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
  classSessionId: string | null;
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
    | "classSessionId"
    | "assignmentMode"
    | "assignmentState"
    | "candidateClassIds"
    | "conflictClassSessionId"
    | "assignedBy"
    | "assignedAt"
  > & {
    /** La clase de la que se la soltó al faltar en Zoom (`detachMissing`). */
    missingFromClassSessionId: string | null;
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
  updateRecording(id: string, patch: RecPatch): Promise<void>;
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
 * Toda decisión nueva —del matcher o de una persona— olvida la clase que se
 * recordaba de cuando la grabación faltó en Zoom: la decisión posterior manda.
 */
const sinClase: RecPatch = {
  classSessionId: null,
  candidateClassIds: [],
  conflictClassSessionId: null,
  missingFromClassSessionId: null,
};

/** Un enlace en la clase que no vino de Zoom es de una persona (también los de antes de la 030). */
const esManual = (c: ClassRow) => c.recordingUrl !== null && c.recordingSource !== "zoom";

/**
 * Limpia la clase SOLO si su enlace es el de esta grabación y vino de Zoom.
 * Un enlace que alguien pegó después no se toca.
 */
export async function clearClassIfOwned(
  tx: AssignmentTx,
  rec: Pick<RecRow, "playUrl" | "classSessionId">,
  classId: string | null = rec.classSessionId
): Promise<void> {
  if (!classId) return;
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

/* ============================================================
 * Automática
 * ============================================================ */

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

  const c = match.classSessionId;
  await tx.lockClasses([c]);
  const cls = await tx.getClass(c);
  const otra = await tx.recordingOnClass(c);
  const hayOtra = otra !== null && otra.id !== rec.id;
  if (!cls || esManual(cls) || (hayOtra && !desplazaALaActual(rec, otra))) {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "conflicto", conflictClassSessionId: c });
    return "conflicto";
  }
  if (!rec.playUrl) {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "pendiente" });
    return "pendiente";
  }
  if (hayOtra) {
    // La desplazada suelta la clase ANTES (índice único: una clase, una
    // grabación). Si es corta queda sin clase; si no, en conflicto con esta
    // clase, para que una persona la vea.
    await tx.updateRecording(
      otra.id,
      esGrabacionCorta(otra.durationMin)
        ? { ...sinClase, assignmentState: "sin_clase", assignedAt: null }
        : { ...sinClase, assignmentState: "conflicto", conflictClassSessionId: c, assignedAt: null }
    );
  }
  await tx.updateRecording(rec.id, {
    ...sinClase,
    classSessionId: c,
    assignmentState: "asignada",
    assignedBy: null,
    assignedAt: now,
  });
  await tx.updateClass(c, { recordingUrl: rec.playUrl, recordingSource: "zoom" });
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
 * de Zoom adjudicada: decidió otra cosa. La grabación pasa a `manual/sin_clase`
 * (la sincronización no la vuelve a poner). Se llama en la MISMA transacción
 * que escribe el enlace manual.
 */
export async function releaseForManualLink(
  orgId: string,
  classSessionId: string,
  userId: string | null,
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<void> {
  await deps.run(orgId, async (tx) => {
    await tx.lockClasses([classSessionId]);
    const rec = await tx.recordingOnClass(classSessionId);
    if (!rec) return;
    await tx.updateRecording(rec.id, {
      ...sinClase,
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
  | { ok: false; reason: "requiere_reemplazo"; current: { kind: "manual" | "zoom"; recordingId: string | null } };

export async function assignManually(
  orgId: string,
  recordingId: string,
  classSessionId: string,
  opts: { replace: boolean; userId: string },
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<ManualResult> {
  return deps.run(orgId, async (tx): Promise<ManualResult> => {
    const rec = await tx.getRecording(recordingId);
    if (!rec) return { ok: false, reason: "no_existe" };
    await tx.lockClasses(ordenados([rec.classSessionId, classSessionId]));
    const cls = await tx.getClass(classSessionId);
    if (!cls) return { ok: false, reason: "no_existe" };
    if (cls.canceledAt) return { ok: false, reason: "clase_cancelada" };
    if (!rec.playUrl) return { ok: false, reason: "sin_enlace" };

    const otra = await tx.recordingOnClass(classSessionId);
    const otraId = otra && otra.id !== rec.id ? otra.id : null;
    const current = otraId
      ? { kind: "zoom" as const, recordingId: otraId }
      : esManual(cls)
        ? { kind: "manual" as const, recordingId: null }
        : null;
    if (current && !opts.replace) return { ok: false, reason: "requiere_reemplazo", current };

    // Primero se suelta lo que había (índice único: una clase, una grabación).
    if (otraId) {
      await tx.updateRecording(otraId, {
        ...sinClase,
        assignmentMode: "manual",
        assignmentState: "sin_clase",
        assignedBy: opts.userId,
        assignedAt: deps.now(),
      });
    }
    if (rec.classSessionId && rec.classSessionId !== classSessionId) {
      await clearClassIfOwned(tx, rec);
    }
    await tx.updateRecording(rec.id, {
      ...sinClase,
      classSessionId,
      assignmentMode: "manual",
      assignmentState: "asignada",
      assignedBy: opts.userId,
      assignedAt: deps.now(),
    });
    await tx.updateClass(classSessionId, { recordingUrl: rec.playUrl, recordingSource: "zoom" });
    return { ok: true };
  });
}

/** Desasigna: la grabación queda `manual/sin_clase` y la sincronización la respeta. */
export async function unassign(
  orgId: string,
  recordingId: string,
  userId: string,
  deps: AssignmentDeps = dbAssignmentDeps
): Promise<ManualResult> {
  return deps.run(orgId, async (tx): Promise<ManualResult> => {
    const rec = await tx.getRecording(recordingId);
    if (!rec) return { ok: false, reason: "no_existe" };
    await tx.lockClasses(ordenados([rec.classSessionId]));
    await clearClassIfOwned(tx, rec);
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
    await tx.lockClasses(ordenados([rec.classSessionId]));
    await clearClassIfOwned(tx, rec);
    await tx.updateRecording(rec.id, {
      ...sinClase,
      assignmentMode: "auto",
      assignmentState: "pendiente",
      assignedBy: null,
      assignedAt: null,
    });
    await evaluar(tx, { ...rec, ...sinClase, assignmentMode: "auto", assignmentState: "pendiente" }, ctx, deps.now());
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
  getMissing(id: string): Promise<{ missingInZoomAt: Date | null; missingFromClassSessionId: string | null } | null>;
  deleteRecording(id: string): Promise<void>;
}

export type MissingDeps = {
  run: <T>(orgId: string, fn: (tx: MissingTx) => Promise<T>) => Promise<T>;
  now: () => Date;
};

/**
 * Una grabación marcada como faltante en Zoom suelta su clase: el enlace de
 * la clase se limpia SOLO si vino de Zoom y es el de ESTA grabación
 * (`clearClassIfOwned`; un enlace pegado a mano nunca se toca). La grabación
 * queda `sin_clase` recordando la clase, y conserva modo, quién y cuándo
 * para la auditoría hasta que se borre. Devuelve si la desvinculó.
 */
export async function detachMissing(orgId: string, recordingId: string, deps: MissingDeps = dbMissingDeps): Promise<boolean> {
  return deps.run(orgId, async (tx) => {
    const rec = await tx.getRecording(recordingId);
    const faltante = await tx.getMissing(recordingId);
    if (!rec || !faltante?.missingInZoomAt || !rec.classSessionId) return false;
    await tx.lockClasses([rec.classSessionId]);
    await clearClassIfOwned(tx, rec);
    await tx.updateRecording(rec.id, {
      ...sinClase,
      assignmentState: "sin_clase",
      missingFromClassSessionId: rec.classSessionId,
    });
    return true;
  });
}

export type Reaparicion = "restaurada" | "no_restaurada" | "automatica";

/**
 * Una grabación que se había soltado por faltar y Zoom volvió a listar.
 *
 *  - **Automática**: no se le fuerza la clase. La página que la volvió a
 *    traer ya la pasó por el matcher (`adjudicatePage`), que decide con el
 *    cronograma de HOY: puede que la clase haya cambiado o tenga otra.
 *  - **Manual**: la decidió una persona, y el matcher no la mira nunca. Vuelve
 *    a SU clase solo si esa clase sigue existiendo, no está cancelada y no
 *    tiene ninguna otra grabación ni un enlace pegado a mano; si no, queda
 *    `manual/sin_clase` para que una persona decida. Nunca desplaza a nadie.
 *
 * En los tres casos se olvida la clase recordada. `null` = no correspondía
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
    if (!rec || !faltante || faltante.missingInZoomAt || !faltante.missingFromClassSessionId) return null;
    const previa = faltante.missingFromClassSessionId;
    const olvidar = () => tx.updateRecording(rec.id, { missingFromClassSessionId: null });

    if (rec.assignmentMode === "auto" || rec.classSessionId) {
      await olvidar();
      return "automatica";
    }
    await tx.lockClasses([previa]);
    const cls = await tx.getClass(previa);
    const otra = await tx.recordingOnClass(previa);
    if (!cls || cls.canceledAt || cls.recordingUrl !== null || otra || !rec.playUrl) {
      await olvidar();
      return "no_restaurada";
    }
    await tx.updateRecording(rec.id, { ...sinClase, classSessionId: previa, assignmentState: "asignada" });
    await tx.updateClass(previa, { recordingUrl: rec.playUrl, recordingSource: "zoom" });
    return "restaurada";
  });
}

/**
 * Borra una grabación que falta en Zoom hace `purgeDays` días o más. Antes
 * suelta su clase (mismo criterio que `detachMissing`) por si la
 * desvinculación no llegó a correr. Nada referencia a `zoom_recording` (la
 * bitácora de corridas es por conexión), así que se borra sin cascadas.
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
    if (rec.classSessionId) {
      await tx.lockClasses([rec.classSessionId]);
      await clearClassIfOwned(tx, rec);
    }
    await tx.deleteRecording(rec.id);
    return true;
  });
}

/* ============================================================
 * Implementación sobre la base
 * ============================================================ */

const r = schema.zoomRecording;
const cs = schema.classSession;

function dbTx(orgId: string): MissingTx {
  return {
    async getMissing(id) {
      const [row] = await getDb()
        .select({ missingInZoomAt: r.missingInZoomAt, missingFromClassSessionId: r.missingFromClassSessionId })
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
          classSessionId: r.classSessionId,
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
      return row ?? null;
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
        .from(r)
        .where(scoped(r.organizationId, orgId, eq(r.classSessionId, classId)))
        .limit(1);
      return row ?? null;
    },
    async updateRecording(id, patch) {
      await getDb()
        .update(r)
        .set({ ...patch, updatedAt: new Date() })
        .where(scoped(r.organizationId, orgId, eq(r.id, id)));
    },
    async updateClass(id, patch) {
      await getDb()
        .update(cs)
        .set({ recordingUrl: patch.recordingUrl, recordingSource: patch.recordingSource, updatedAt: new Date() })
        .where(scoped(cs.organizationId, orgId, and(eq(cs.id, id))));
    },
  };
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
