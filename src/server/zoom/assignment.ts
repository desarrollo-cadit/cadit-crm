import { and, eq, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
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
  >
>;

export interface AssignmentTx {
  /** Advisory locks por clase, ya ordenados. */
  lockClasses(ids: string[]): Promise<void>;
  getRecording(id: string): Promise<RecRow | null>;
  /** `FOR UPDATE`. */
  getClass(id: string): Promise<ClassRow | null>;
  recordingOnClass(classId: string): Promise<{ id: string } | null>;
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

const sinClase: RecPatch = {
  classSessionId: null,
  candidateClassIds: [],
  conflictClassSessionId: null,
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

/* ============================================================
 * Automática
 * ============================================================ */

async function evaluar(tx: AssignmentTx, rec: RecRow, ctx: MatchContext, now: Date): Promise<RecRow["assignmentState"]> {
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
  if (!cls || esManual(cls) || (otra && otra.id !== rec.id)) {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "conflicto", conflictClassSessionId: c });
    return "conflicto";
  }
  if (!rec.playUrl) {
    await tx.updateRecording(rec.id, { ...sinClase, assignmentState: "pendiente" });
    return "pendiente";
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
 * Implementación sobre la base
 * ============================================================ */

const r = schema.zoomRecording;
const cs = schema.classSession;

function dbTx(orgId: string): AssignmentTx {
  return {
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
        .select({ id: r.id })
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
