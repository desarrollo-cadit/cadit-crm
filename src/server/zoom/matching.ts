import { and, between, eq, isNotNull, isNull } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { classInstant } from "@/lib/schedule-time";
import { extractMeetingId } from "@/lib/zoom";
import { organizationTimezone } from "@/server/finanzas-periodo";
import { resolveMeetingUrl } from "@/server/virtual-rooms";

/**
 * 030 US2 (DV-006, contrato adjudicacion.md) — A qué clase va una grabación.
 *
 * Núcleo PURO (`matchRecording`) y un cargador que arma sus entradas. La
 * regla que lo gobierna todo viene de la 025: **mejor ningún enlace que el
 * equivocado**. Ante dos candidatas igual de válidas no elige —la grabación
 * queda "ambigua" para que una persona decida—, porque elegir "la más
 * cercana" es como un choque de aulas termina mostrando la clase de otra
 * cohorte a un alumno.
 */

export type MatchableClass = {
  classSessionId: string;
  cohortId: string;
  /** `classInstant(date, start_time, org.timezone)` — NUNCA armado a mano. */
  startsAt: Date;
  endsAt: Date | null;
  /** Número de la reunión efectiva (clase → cohorte). */
  meetingId: string | null;
  /** Aula efectiva (clase → cohorte). */
  roomId: string | null;
};

export type MatchableRoom = {
  roomId: string;
  zoomConnectionId: string;
  zoomUserId: string;
  pmiMeetingId: string | null;
};

export type MatchInput = {
  recording: { zoomConnectionId: string; meetingId: string; hostZoomUserId: string; startTime: Date };
  /** Ya filtradas: reales, no canceladas, con horario. */
  classes: MatchableClass[];
  /** Aulas activas vinculadas a Zoom. */
  rooms: MatchableRoom[];
  tolerance: { beforeMin: number; afterFallbackMin: number };
};

export type MatchResult =
  | { kind: "unica"; classSessionId: string; signal: "reunion" | "aula" }
  | { kind: "ambigua"; candidateIds: string[]; signal: "reunion" | "aula" }
  | { kind: "ninguna" };

function decidir(ids: string[], signal: "reunion" | "aula"): MatchResult | null {
  // Orden estable: el resultado no depende del orden en que llegaron las clases.
  const unicos = [...new Set(ids)].sort();
  if (unicos.length === 1) return { kind: "unica", classSessionId: unicos[0]!, signal };
  if (unicos.length > 1) return { kind: "ambigua", candidateIds: unicos, signal };
  return null;
}

export function matchRecording(input: MatchInput): MatchResult {
  const r = input.recording;
  const t = r.startTime.getTime();
  const { beforeMin, afterFallbackMin } = input.tolerance;

  // Bordes inclusive: [inicio − tolerancia, fin (o inicio + fin supuesto)].
  const compatibles = input.classes.filter((c) => {
    const desde = c.startsAt.getTime() - beforeMin * 60_000;
    const hasta = (c.endsAt ?? new Date(c.startsAt.getTime() + afterFallbackMin * 60_000)).getTime();
    return desde <= t && t <= hasta;
  });

  // Señal A — el número de reunión identifica a la COHORTE aunque compartan cuenta.
  const porReunion = decidir(
    compatibles.filter((c) => c.meetingId !== null && c.meetingId === r.meetingId).map((c) => c.classSessionId),
    "reunion"
  );
  if (porReunion) return porReunion;

  // Señal B — el aula del anfitrión (por conexión + usuario) o la de su PMI.
  const aulas = new Set(
    input.rooms
      .filter(
        (room) =>
          (room.zoomConnectionId === r.zoomConnectionId && room.zoomUserId === r.hostZoomUserId) ||
          (room.pmiMeetingId !== null && room.pmiMeetingId === r.meetingId)
      )
      .map((room) => room.roomId)
  );
  const porAula = decidir(
    compatibles.filter((c) => c.roomId !== null && aulas.has(c.roomId)).map((c) => c.classSessionId),
    "aula"
  );
  return porAula ?? { kind: "ninguna" };
}

/* ============================================================
 * Cargador
 * ============================================================ */

export type ClassCandidateRow = {
  id: string;
  cohortId: string;
  date: Date;
  startTime: string | null;
  endTime: string | null;
  canceledAt: Date | null;
  classMeetingUrl: string | null;
  cohortMeetingUrl: string | null;
  classRoomId: string | null;
  cohortRoomId: string | null;
};

/** Filas reales → clases adjudicables. Canceladas y sin horario quedan afuera. */
export function toMatchableClasses(rows: ClassCandidateRow[], timezone: string): MatchableClass[] {
  const out: MatchableClass[] = [];
  for (const row of rows) {
    if (row.canceledAt) continue;
    const startsAt = classInstant(row.date, row.startTime, timezone);
    if (!startsAt) continue;
    out.push({
      classSessionId: row.id,
      cohortId: row.cohortId,
      startsAt,
      endsAt: classInstant(row.date, row.endTime, timezone),
      meetingId: extractMeetingId(
        resolveMeetingUrl({ classMeetingUrl: row.classMeetingUrl, cohortMeetingUrl: row.cohortMeetingUrl })
      ),
      roomId: row.classRoomId ?? row.cohortRoomId,
    });
  }
  return out;
}

export function toMatchableRooms(
  rows: { id: string; url: string; zoomConnectionId: string; zoomUserId: string }[]
): MatchableRoom[] {
  return rows.map((r) => ({
    roomId: r.id,
    zoomConnectionId: r.zoomConnectionId,
    zoomUserId: r.zoomUserId,
    pmiMeetingId: extractMeetingId(r.url),
  }));
}

export type MatchContext = {
  classes: MatchableClass[];
  rooms: MatchableRoom[];
  tolerance: { beforeMin: number; afterFallbackMin: number };
};

const DAY_MS = 86_400_000;

/**
 * Las candidatas de una página de grabaciones, en DOS consultas (clases y
 * aulas) — no una por grabación. Las proyecciones no se cargan porque no son
 * filas: nunca son adjudicables.
 */
export async function loadMatchContext(orgId: string, window: { from: Date; to: Date }): Promise<MatchContext> {
  const db = getDb();
  const tz = await organizationTimezone(orgId);
  // ± 1 día: la fecha de la clase es local y la grabación está en UTC.
  const desde = new Date(Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), window.from.getUTCDate()) - DAY_MS);
  const hasta = new Date(Date.UTC(window.to.getUTCFullYear(), window.to.getUTCMonth(), window.to.getUTCDate()) + DAY_MS);

  const filas = await db
    .select({
      id: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      date: schema.classSession.date,
      startTime: schema.classSession.startTime,
      endTime: schema.classSession.endTime,
      canceledAt: schema.classSession.canceledAt,
      classMeetingUrl: schema.classSession.meetingUrl,
      cohortMeetingUrl: schema.cohort.meetingUrl,
      classRoomId: schema.classSession.virtualRoomId,
      cohortRoomId: schema.cohort.virtualRoomId,
    })
    .from(schema.classSession)
    .innerJoin(schema.cohort, eq(schema.cohort.id, schema.classSession.cohortId))
    .where(
      scoped(
        schema.classSession.organizationId,
        orgId,
        between(schema.classSession.date, desde, hasta),
        isNull(schema.classSession.canceledAt),
        isNotNull(schema.classSession.startTime)
      )
    );

  const aulas = await db
    .select({
      id: schema.virtualRoom.id,
      url: schema.virtualRoom.url,
      zoomConnectionId: schema.virtualRoom.zoomConnectionId,
      zoomUserId: schema.virtualRoom.zoomUserId,
    })
    .from(schema.virtualRoom)
    .where(
      scoped(
        schema.virtualRoom.organizationId,
        orgId,
        and(isNull(schema.virtualRoom.archivedAt), isNotNull(schema.virtualRoom.zoomConnectionId))
      )
    );

  const env = getEnv();
  return {
    classes: toMatchableClasses(filas, tz),
    rooms: toMatchableRooms(
      aulas
        .filter((a) => a.zoomConnectionId && a.zoomUserId)
        .map((a) => ({ id: a.id, url: a.url, zoomConnectionId: a.zoomConnectionId!, zoomUserId: a.zoomUserId! }))
    ),
    tolerance: { beforeMin: env.ZOOM_MATCH_BEFORE_MIN, afterFallbackMin: env.ZOOM_MATCH_AFTER_FALLBACK_MIN },
  };
}
