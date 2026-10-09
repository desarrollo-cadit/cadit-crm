import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
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

/** Los tamaños de página que ofrece la tabla. */
export const PAGE_SIZES = [25, 50, 100] as const;

/**
 * Paginación NUMERADA (página + tamaño) y no por cursor: la tabla muestra
 * "página 3 de 12" y deja saltar a cualquiera, y con un `count(*)` sobre el
 * índice `(organization_id, start_time)` el costo es el mismo.
 */
export const recordingsQuerySchema = z
  .object({
    connectionId: z.string().min(1).optional(),
    roomId: z.string().min(1).optional(),
    from: dia.optional(),
    to: dia.optional(),
    state: z.enum(RECORDING_STATES).optional(),
    page: z.coerce.number().int().min(1).max(100_000).default(1),
    pageSize: z.coerce
      .number()
      .int()
      .refine((n) => (PAGE_SIZES as readonly number[]).includes(n), "El tamaño de página es 25, 50 o 100.")
      .default(25),
    /** Por fecha de inicio: `desc` = más recientes primero. */
    sort: z.enum(["desc", "asc"]).default("desc"),
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

/**
 * La página que de verdad se devuelve. Una página fuera de rango (un enlace
 * guardado cuando había más grabaciones, o un filtro que achicó el total) cae
 * en la última en vez de mostrar una tabla vacía que parece un error.
 */
export function pageWindow(
  total: number,
  page: number,
  pageSize: number
): { page: number; offset: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const actual = Math.min(Math.max(1, page), totalPages);
  return { page: actual, offset: (actual - 1) * pageSize, totalPages };
}

/** Zoom marca la transcripción como `TRANSCRIPT` (audio) o `CC` (subtítulos). */
export function hasTranscript(fileTypes: readonly string[]): boolean {
  return fileTypes.includes("TRANSCRIPT") || fileTypes.includes("CC");
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
  /** Solo metadatos (`MP4`, `TRANSCRIPT`…): el CRM no descarga nada. */
  fileTypes: string[];
  hasTranscript: boolean;
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
  fileTypes: string[];
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
    fileTypes: row.fileTypes,
    hasTranscript: hasTranscript(row.fileTypes),
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

export type RecordingsPage = {
  rows: RecordingRowDto[];
  /** Cuántas grabaciones cumplen los filtros (todas las páginas). */
  total: number;
  /** La página devuelta (puede ser menor que la pedida: `pageWindow`). */
  page: number;
  pageSize: number;
  totalPages: number;
  configured: boolean;
};

export async function listRecordings(
  orgId: string,
  q: RecordingsQuery,
  /** Interno: una sola grabación (la respuesta de asignar/desasignar). */
  opts: { ids?: string[] } = {}
): Promise<RecordingsPage> {
  const db = getDb();

  const [conexion] = await db
    .select({ id: schema.zoomConnection.id })
    .from(schema.zoomConnection)
    .where(scoped(schema.zoomConnection.organizationId, orgId))
    .limit(1);
  const configured = conexion !== undefined;
  if (!configured) return { rows: [], total: 0, page: 1, pageSize: q.pageSize, totalPages: 1, configured };

  const tz = await organizationTimezone(orgId);
  const rango = dayRange(q.from, q.to, tz);

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
    opts.ids ? inArray(t.id, opts.ids) : undefined,
  ];
  const donde = scoped(t.organizationId, orgId, ...condiciones);

  // Los filtros son todos de `zoom_recording`: el total se cuenta sin joins.
  const [{ total } = { total: 0 }] = await db.select({ total: count() }).from(t).where(donde);
  const ventana = pageWindow(total, q.page, q.pageSize);
  const orden = q.sort === "asc" ? [asc(t.startTime), asc(t.id)] : [desc(t.startTime), desc(t.id)];

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
      fileTypes: t.fileTypes,
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
    .where(donde)
    .orderBy(...orden)
    .limit(q.pageSize)
    .offset(ventana.offset);

  const pagina = filas;

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

  return {
    rows: pagina.map((r) => toRecordingRowDto(r, { classes, users })),
    total,
    page: ventana.page,
    pageSize: q.pageSize,
    totalPages: ventana.totalPages,
    configured,
  };
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

/** La fila de UNA grabación (lo que devuelven asignar, desasignar y volver a automático). */
export async function getRecordingRowDto(orgId: string, id: string): Promise<RecordingRowDto | null> {
  const { rows } = await listRecordings(orgId, recordingsQuerySchema.parse({}), { ids: [id] });
  return rows[0] ?? null;
}

/* ============================================================
 * Candidatas para asignar a mano (US3)
 * ============================================================ */

export const candidatesQuerySchema = z
  .object({
    /** Texto de cohorte o curso. */
    q: z.string().trim().max(100).optional(),
    /** Un día de la academia: las clases reales de ese día, en cualquier aula. */
    date: dia.optional(),
    /** Todas las clases reales de UNA cohorte (el segundo paso: cohorte → clase). */
    cohortId: z.string().min(1).optional(),
  })
  .strict();

export type ClassOptionDto = {
  id: string;
  number: number;
  cohortId: string;
  cohortName: string;
  courseName: string;
  /** YYYY-MM-DD (día de la clase). */
  date: string;
  startsAt: string | null;
  roomName: string | null;
  /** Se lista, deshabilitada: no se le puede asignar grabación. */
  canceled: boolean;
  /** Qué se reemplazaría al elegirla. */
  current: { kind: "manual" | "zoom"; recordingId: string | null } | null;
};

export type ClassOptionRow = {
  id: string;
  number: number;
  cohortId: string;
  cohortName: string | null;
  courseName: string;
  date: Date;
  startTime: string | null;
  canceledAt: Date | null;
  recordingUrl: string | null;
  recordingSource: "manual" | "zoom" | null;
  classRoomId: string | null;
  cohortRoomId: string | null;
};

export function toClassOption(
  row: ClassOptionRow,
  ctx: { timezone: string; rooms: Map<string, string>; recByClass: Map<string, string> }
): ClassOptionDto {
  const roomId = row.classRoomId ?? row.cohortRoomId;
  const rec = ctx.recByClass.get(row.id);
  return {
    id: row.id,
    number: row.number,
    cohortId: row.cohortId,
    cohortName: row.cohortName ?? row.courseName,
    courseName: row.courseName,
    date: row.date.toISOString().slice(0, 10),
    startsAt: classInstant(row.date, row.startTime, ctx.timezone)?.toISOString() ?? null,
    roomName: roomId ? (ctx.rooms.get(roomId) ?? null) : null,
    canceled: row.canceledAt !== null,
    current: rec
      ? { kind: "zoom", recordingId: rec }
      : row.recordingUrl && row.recordingSource !== "zoom"
        ? { kind: "manual", recordingId: null }
        : null,
  };
}

const porInicio = (a: ClassOptionDto, b: ClassOptionDto) =>
  (a.startsAt ?? a.date).localeCompare(b.startsAt ?? b.date) || a.id.localeCompare(b.id);

/** Candidatas del matcher primero; después las del mismo día. Sin repetir. */
export function mergeSuggested(candidates: ClassOptionDto[], sameDay: ClassOptionDto[]): ClassOptionDto[] {
  const vistos = new Set<string>();
  const out: ClassOptionDto[] = [];
  for (const o of [...[...candidates].sort(porInicio), ...[...sameDay].sort(porInicio)]) {
    if (vistos.has(o.id)) continue;
    vistos.add(o.id);
    out.push(o);
  }
  return out;
}

export type CandidatesDto = {
  suggested: ClassOptionDto[];
  /** Cohortes que coinciden con `q` (para elegir cohorte → clase). */
  cohorts: { id: string; name: string; courseName: string }[];
  results: ClassOptionDto[];
};

/**
 * Lo que necesita el diálogo de asignar: sugeridas, cohortes por texto y las
 * clases de la cohorte o del día elegidos. Solo clases REALES (filas de
 * `class_session`): una proyección no existe y no se le puede escribir nada.
 */
export async function listCandidates(
  orgId: string,
  recordingId: string,
  q: z.infer<typeof candidatesQuerySchema>
): Promise<CandidatesDto | null> {
  const db = getDb();
  const [rec] = await db
    .select({
      startTime: t.startTime,
      candidateClassIds: t.candidateClassIds,
      conflictClassSessionId: t.conflictClassSessionId,
    })
    .from(t)
    .where(scoped(t.organizationId, orgId, eq(t.id, recordingId)))
    .limit(1);
  if (!rec) return null;

  const tz = await organizationTimezone(orgId);
  const cs = schema.classSession;

  async function clases(cond: SQL, limit: number): Promise<ClassOptionDto[]> {
    const filas = await db
      .select({
        id: cs.id,
        number: cs.number,
        cohortId: cs.cohortId,
        cohortName: schema.cohort.name,
        courseName: schema.course.name,
        date: cs.date,
        startTime: cs.startTime,
        canceledAt: cs.canceledAt,
        recordingUrl: cs.recordingUrl,
        recordingSource: cs.recordingSource,
        classRoomId: cs.virtualRoomId,
        cohortRoomId: schema.cohort.virtualRoomId,
      })
      .from(cs)
      .innerJoin(schema.cohort, eq(schema.cohort.id, cs.cohortId))
      .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
      .where(scoped(cs.organizationId, orgId, cond))
      .orderBy(cs.date, cs.number)
      .limit(limit);
    if (filas.length === 0) return [];

    const roomIds = [...new Set(filas.map((f) => f.classRoomId ?? f.cohortRoomId).filter(Boolean))] as string[];
    const rooms = new Map<string, string>();
    if (roomIds.length > 0) {
      const rs = await db
        .select({ id: schema.virtualRoom.id, name: schema.virtualRoom.name })
        .from(schema.virtualRoom)
        .where(scoped(schema.virtualRoom.organizationId, orgId, inArray(schema.virtualRoom.id, roomIds)));
      for (const r of rs) rooms.set(r.id, r.name);
    }
    const recByClass = new Map<string, string>();
    const asignadas = await db
      .select({ id: t.id, classSessionId: t.classSessionId })
      .from(t)
      .where(scoped(t.organizationId, orgId, inArray(t.classSessionId, filas.map((f) => f.id))));
    for (const r of asignadas) if (r.classSessionId) recByClass.set(r.classSessionId, r.id);
    return filas.map((f) => toClassOption(f, { timezone: tz, rooms, recByClass }));
  }

  // El día de la grabación en la zona de la ACADEMIA (en-CA da AAAA-MM-DD).
  const diaLocal = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(rec.startTime);
  const delDia = (d: string) => {
    const inicio = new Date(`${d}T00:00:00Z`);
    return and(gte(cs.date, inicio), lt(cs.date, new Date(inicio.getTime() + 86_400_000)))!;
  };

  const candidatasIds = [
    ...rec.candidateClassIds,
    ...(rec.conflictClassSessionId ? [rec.conflictClassSessionId] : []),
  ];
  const suggested = mergeSuggested(
    candidatasIds.length > 0 ? await clases(inArray(cs.id, candidatasIds), 50) : [],
    await clases(delDia(diaLocal), 50)
  );

  let cohorts: CandidatesDto["cohorts"] = [];
  if (q.q) {
    const patron = `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
    const filas = await db
      .select({ id: schema.cohort.id, name: schema.cohort.name, courseName: schema.course.name })
      .from(schema.cohort)
      .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
      .where(
        scoped(
          schema.cohort.organizationId,
          orgId,
          or(sql`${schema.cohort.name} ilike ${patron}`, sql`${schema.course.name} ilike ${patron}`)
        )
      )
      .orderBy(desc(schema.cohort.startDate))
      .limit(20);
    cohorts = filas.map((c) => ({ id: c.id, name: c.name ?? c.courseName, courseName: c.courseName }));
  }

  const results = q.cohortId
    ? await clases(eq(cs.cohortId, q.cohortId), 200)
    : q.date
      ? await clases(delDia(q.date), 50)
      : [];

  return { suggested, cohorts, results };
}
