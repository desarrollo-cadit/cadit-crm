import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { classInstant } from "@/lib/schedule-time";
import { organizationTimezone } from "@/server/finanzas-periodo";
import { openPasscode, type SealedPasscode } from "./connections";
import { currentRun } from "./lease";

/**
 * 030 US1 — El listado de grabaciones y el estado de la sincronización.
 *
 * Todo es de STAFF (`grabaciones.ver`): ningún portal lee esta tabla. Al
 * alumno la grabación le llega por `class_session.recording_url`, que es lo
 * que ya leían los portales (DV-007).
 */

const t = schema.zoomRecording;

/* ============================================================
 * Filtros
 * ============================================================ */

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "La fecha va como AAAA-MM-DD.");

export const RECORDING_STATES = ["asignada", "ambigua", "conflicto", "sin_clase", "pendiente", "faltante"] as const;

export const recordingsQuerySchema = z
  .object({
    connectionId: z.string().min(1).optional(),
    roomId: z.string().min(1).optional(),
    from: dia.optional(),
    to: dia.optional(),
    state: z.enum(RECORDING_STATES).optional(),
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .strict();

export type RecordingsQuery = z.infer<typeof recordingsQuerySchema>;

/**
 * Las fechas del filtro son días de la ACADEMIA: el 1 de octubre empieza a la
 * medianoche de Montevideo, no a la de Greenwich. `[gte, lt)`.
 */
export function dayRange(
  from: string | undefined,
  to: string | undefined,
  timezone: string
): { gte: Date | null; lt: Date | null } {
  const inicio = (d: string) => classInstant(new Date(`${d}T00:00:00Z`), "00:00", timezone);
  const siguiente = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + 86_400_000);
  return {
    gte: from ? inicio(from) : null,
    lt: to ? classInstant(siguiente(to), "00:00", timezone) : null,
  };
}

/** Cursor estable sobre el orden `start_time desc, id desc`. */
export function encodeCursor(c: { startTime: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ t: c.startTime.toISOString(), id: c.id })).toString("base64url");
}

export function decodeCursor(raw: string): { startTime: Date; id: string } | null {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { t?: unknown; id?: unknown };
    if (typeof v.t !== "string" || typeof v.id !== "string") return null;
    const startTime = new Date(v.t);
    return Number.isNaN(startTime.getTime()) ? null : { startTime, id: v.id };
  } catch {
    return null;
  }
}

/* ============================================================
 * DTO
 * ============================================================ */

export type AssignmentState = "pendiente" | "asignada" | "ambigua" | "conflicto" | "sin_clase";

export type RecordingRowDto = {
  id: string;
  connection: { id: string; name: string; archived: boolean };
  room: { id: string; name: string } | null;
  hostEmail: string | null;
  topic: string | null;
  /** ISO UTC; la UI lo muestra en la zona de la academia. */
  startTime: string;
  durationMin: number | null;
  playUrl: string | null;
  /** SOLO si no viaja embebido en `playUrl`. */
  passcode: string | null;
  passcodeEmbedded: boolean;
  autoDeleteDate: string | null;
  missingInZoom: boolean;
  assignment: {
    mode: "auto" | "manual";
    state: AssignmentState;
    classSession: { id: string; number: number; date: string; cohortId: string; cohortName: string } | null;
    candidates: { id: string; number: number; cohortName: string; startsAt: string }[];
    conflictWith: { id: string; number: number; cohortName: string } | null;
    assignedBy: string | null;
    assignedAt: string | null;
  };
};

export type RecordingRow = SealedPasscode & {
  id: string;
  zoomConnectionId: string;
  connectionName: string;
  connectionArchivedAt: Date | null;
  virtualRoomId: string | null;
  roomName: string | null;
  hostEmail: string | null;
  topic: string | null;
  startTime: Date;
  durationMin: number | null;
  playUrl: string | null;
  passcodeEmbedded: boolean;
  autoDeleteDate: string | null;
  missingInZoomAt: Date | null;
  assignmentMode: "auto" | "manual";
  assignmentState: AssignmentState;
  classSessionId: string | null;
  candidateClassIds: string[];
  conflictClassSessionId: string | null;
  assignedBy: string | null;
  assignedAt: Date | null;
};

export type ClassRef = {
  id: string;
  number: number;
  date: string;
  cohortId: string;
  cohortName: string;
  startsAt: string | null;
};

export function toRecordingRowDto(
  row: RecordingRow,
  ctx: { classes: Map<string, ClassRef>; users: Map<string, string> }
): RecordingRowDto {
  const clase = row.classSessionId ? ctx.classes.get(row.classSessionId) : undefined;
  const conflicto = row.conflictClassSessionId ? ctx.classes.get(row.conflictClassSessionId) : undefined;
  return {
    id: row.id,
    connection: {
      id: row.zoomConnectionId,
      name: row.connectionName,
      archived: row.connectionArchivedAt !== null,
    },
    room: row.virtualRoomId && row.roomName ? { id: row.virtualRoomId, name: row.roomName } : null,
    hostEmail: row.hostEmail,
    topic: row.topic,
    startTime: row.startTime.toISOString(),
    durationMin: row.durationMin,
    playUrl: row.playUrl,
    passcode: row.passcodeEmbedded ? null : openPasscode(row),
    passcodeEmbedded: row.passcodeEmbedded,
    autoDeleteDate: row.autoDeleteDate,
    missingInZoom: row.missingInZoomAt !== null,
    assignment: {
      mode: row.assignmentMode,
      state: row.assignmentState,
      classSession: clase
        ? { id: clase.id, number: clase.number, date: clase.date, cohortId: clase.cohortId, cohortName: clase.cohortName }
        : null,
      candidates: row.candidateClassIds.flatMap((id) => {
        const c = ctx.classes.get(id);
        return c ? [{ id: c.id, number: c.number, cohortName: c.cohortName, startsAt: c.startsAt ?? c.date }] : [];
      }),
      conflictWith: conflicto ? { id: conflicto.id, number: conflicto.number, cohortName: conflicto.cohortName } : null,
      assignedBy: row.assignedBy ? (ctx.users.get(row.assignedBy) ?? null) : null,
      assignedAt: row.assignedAt?.toISOString() ?? null,
    },
  };
}

/* ============================================================
 * Listado
 * ============================================================ */

export async function listRecordings(
  orgId: string,
  q: RecordingsQuery
): Promise<{ rows: RecordingRowDto[]; nextCursor: string | null; configured: boolean }> {
  const db = getDb();

  const [conexion] = await db
    .select({ id: schema.zoomConnection.id })
    .from(schema.zoomConnection)
    .where(scoped(schema.zoomConnection.organizationId, orgId))
    .limit(1);
  const configured = conexion !== undefined;
  if (!configured) return { rows: [], nextCursor: null, configured };

  const tz = await organizationTimezone(orgId);
  const rango = dayRange(q.from, q.to, tz);
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;

  const condiciones: (SQL | undefined)[] = [
    q.connectionId ? eq(t.zoomConnectionId, q.connectionId) : undefined,
    q.roomId ? eq(t.virtualRoomId, q.roomId) : undefined,
    rango.gte ? gte(t.startTime, rango.gte) : undefined,
    rango.lt ? lt(t.startTime, rango.lt) : undefined,
    q.state === "faltante"
      ? isNotNull(t.missingInZoomAt)
      : q.state
        ? eq(t.assignmentState, q.state)
        : undefined,
    cursor
      ? or(lt(t.startTime, cursor.startTime), and(eq(t.startTime, cursor.startTime), lt(t.id, cursor.id)))
      : undefined,
  ];

  const filas = await db
    .select({
      id: t.id,
      zoomConnectionId: t.zoomConnectionId,
      connectionName: schema.zoomConnection.name,
      connectionArchivedAt: schema.zoomConnection.archivedAt,
      virtualRoomId: t.virtualRoomId,
      roomName: schema.virtualRoom.name,
      hostEmail: t.hostEmail,
      topic: t.topic,
      startTime: t.startTime,
      durationMin: t.durationMin,
      playUrl: t.playUrl,
      passcodeCipher: t.passcodeCipher,
      passcodeIv: t.passcodeIv,
      passcodeTag: t.passcodeTag,
      passcodeEmbedded: t.passcodeEmbedded,
      autoDeleteDate: t.autoDeleteDate,
      missingInZoomAt: t.missingInZoomAt,
      assignmentMode: t.assignmentMode,
      assignmentState: t.assignmentState,
      classSessionId: t.classSessionId,
      candidateClassIds: t.candidateClassIds,
      conflictClassSessionId: t.conflictClassSessionId,
      assignedBy: t.assignedBy,
      assignedAt: t.assignedAt,
    })
    .from(t)
    .innerJoin(schema.zoomConnection, eq(schema.zoomConnection.id, t.zoomConnectionId))
    .leftJoin(schema.virtualRoom, eq(schema.virtualRoom.id, t.virtualRoomId))
    .where(scoped(t.organizationId, orgId, ...condiciones))
    .orderBy(desc(t.startTime), desc(t.id))
    .limit(q.limit + 1);

  const pagina = filas.slice(0, q.limit);
  const ultima = pagina.at(-1);
  const nextCursor = filas.length > q.limit && ultima ? encodeCursor(ultima) : null;

  // Clases y personas de TODA la página en una consulta cada una.
  const claseIds = [
    ...new Set(
      pagina.flatMap((r) => [r.classSessionId, r.conflictClassSessionId, ...r.candidateClassIds].filter(Boolean))
    ),
  ] as string[];
  const classes = new Map<string, ClassRef>();
  if (claseIds.length > 0) {
    const cs = await db
      .select({
        id: schema.classSession.id,
        number: schema.classSession.number,
        date: schema.classSession.date,
        startTime: schema.classSession.startTime,
        cohortId: schema.classSession.cohortId,
        cohortName: schema.cohort.name,
        courseName: schema.course.name,
      })
      .from(schema.classSession)
      .innerJoin(schema.cohort, eq(schema.cohort.id, schema.classSession.cohortId))
      .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
      .where(scoped(schema.classSession.organizationId, orgId, inArray(schema.classSession.id, claseIds)));
    for (const c of cs) {
      classes.set(c.id, {
        id: c.id,
        number: c.number,
        date: c.date.toISOString().slice(0, 10),
        cohortId: c.cohortId,
        // Una cohorte sin nombre propio se llama como su curso (igual que en clases).
        cohortName: c.cohortName ?? c.courseName,
        startsAt: classInstant(c.date, c.startTime, tz)?.toISOString() ?? null,
      });
    }
  }
  const userIds = [...new Set(pagina.map((r) => r.assignedBy).filter(Boolean))] as string[];
  const users = new Map<string, string>();
  if (userIds.length > 0) {
    const us = await db
      .select({ id: schema.user.id, name: schema.user.name })
      .from(schema.user)
      .where(inArray(schema.user.id, userIds));
    for (const u of us) users.set(u.id, u.name);
  }

  return { rows: pagina.map((r) => toRecordingRowDto(r, { classes, users })), nextCursor, configured };
}

/* ============================================================
 * Estado de la sincronización
 * ============================================================ */

type LastRun = {
  status: "corriendo" | "ok" | "parcial" | "error";
  startedAt: Date;
  finishedAt: Date | null;
  newCount: number;
  assignedCount: number;
  ambiguousCount: number;
  conflictCount: number;
  error: string | null;
};

export type SyncStatusDto = {
  running: { startedAt: string } | null;
  connections: {
    id: string;
    name: string;
    status: "sin_probar" | "ok" | "error";
    lastSyncAt: string | null;
    syncedThrough: string | null;
    lastError: string | null;
    lastRun:
      | (Omit<LastRun, "startedAt" | "finishedAt"> & { startedAt: string; finishedAt: string | null })
      | null;
  }[];
  /** 0 = periódica apagada. */
  periodicIntervalMin: number;
};

export function toSyncStatusDto(input: {
  running: { startedAt: Date } | null;
  connections: {
    id: string;
    name: string;
    status: "sin_probar" | "ok" | "error";
    lastSyncAt: Date | null;
    syncedThrough: string | null;
    lastError: string | null;
    archivedAt: Date | null;
  }[];
  lastRuns: Map<string, LastRun>;
  periodicIntervalMin: number;
}): SyncStatusDto {
  return {
    running: input.running ? { startedAt: input.running.startedAt.toISOString() } : null,
    connections: input.connections
      .filter((c) => c.archivedAt === null)
      .map((c) => {
        const run = input.lastRuns.get(c.id);
        return {
          id: c.id,
          name: c.name,
          status: c.status,
          lastSyncAt: c.lastSyncAt?.toISOString() ?? null,
          syncedThrough: c.syncedThrough,
          lastError: c.lastError,
          lastRun: run
            ? {
                ...run,
                startedAt: run.startedAt.toISOString(),
                finishedAt: run.finishedAt?.toISOString() ?? null,
              }
            : null,
        };
      }),
    periodicIntervalMin: input.periodicIntervalMin,
  };
}

export async function getSyncStatus(orgId: string): Promise<SyncStatusDto> {
  const db = getDb();
  const connections = await db
    .select({
      id: schema.zoomConnection.id,
      name: schema.zoomConnection.name,
      status: schema.zoomConnection.status,
      lastSyncAt: schema.zoomConnection.lastSyncAt,
      syncedThrough: schema.zoomConnection.syncedThrough,
      lastError: schema.zoomConnection.lastError,
      archivedAt: schema.zoomConnection.archivedAt,
    })
    .from(schema.zoomConnection)
    .where(scoped(schema.zoomConnection.organizationId, orgId))
    .orderBy(schema.zoomConnection.name);

  // La última corrida de cada conexión, en una consulta.
  const runs = await db
    .selectDistinctOn([schema.zoomSyncRun.zoomConnectionId], {
      connectionId: schema.zoomSyncRun.zoomConnectionId,
      status: schema.zoomSyncRun.status,
      startedAt: schema.zoomSyncRun.startedAt,
      finishedAt: schema.zoomSyncRun.finishedAt,
      newCount: schema.zoomSyncRun.newCount,
      assignedCount: schema.zoomSyncRun.assignedCount,
      ambiguousCount: schema.zoomSyncRun.ambiguousCount,
      conflictCount: schema.zoomSyncRun.conflictCount,
      error: schema.zoomSyncRun.error,
    })
    .from(schema.zoomSyncRun)
    .where(scoped(schema.zoomSyncRun.organizationId, orgId))
    .orderBy(schema.zoomSyncRun.zoomConnectionId, desc(schema.zoomSyncRun.startedAt), sql`${schema.zoomSyncRun.id} desc`);

  const lastRuns = new Map<string, LastRun>();
  for (const { connectionId, ...run } of runs) lastRuns.set(connectionId, run);

  return toSyncStatusDto({
    running: await currentRun(orgId),
    connections,
    lastRuns,
    periodicIntervalMin: getEnv().ZOOM_SYNC_INTERVAL_MIN,
  });
}
