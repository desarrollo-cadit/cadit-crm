import { and, count, desc, eq, inArray, isNull, lt, lte, ne, notExists, or, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { classInstant } from "@/lib/schedule-time";
import {
  extractMeetingId,
  listMeetingParticipants as zoomListMeetingParticipants,
  listPastInstances as zoomListPastInstances,
  listUserPastMeetings as zoomListUserPastMeetings,
  ZoomError,
  type ZoomCredentials,
  type ZoomParticipantSegment,
  type ZoomPastInstance,
  type ZoomPastMeeting,
} from "@/lib/zoom";
import { elegirInstancia, type InstanciaCandidata } from "@/lib/zoom-instance";
import {
  deGrupoFinalizado,
  estadoPorError,
  ESTADOS_REINTENTABLES,
  fueraDelPlazoDeZoom,
  proximoIntento,
  type EstadoDeTraida,
} from "@/lib/zoom-attendance-estado";
import { loadZoomCredentials } from "./connections";
import { dbLeaseStore, LEASE_MS, leaseOwner, type LeaseStore } from "./lease";
import { inOrgScope } from "./scope";

/**
 * Asistencia sugerida desde Zoom (constitución 1.9.0) — "traer de Zoom".
 *
 * Por clase: ubicar la INSTANCIA de la reunión, leer su reporte de
 * participantes y guardar los tramos crudos (minimizados). Reglas:
 *
 *  - **Nunca toca `attendance`.** Ni al traer ni al fallar: la sugerencia se
 *    calcula al leer y solo la confirmación de una persona escribe
 *    (`attendance-review.ts`). Un fallo deja la asistencia como estaba.
 *  - **Ninguna transacción abierta durante el HTTP a Zoom** (regla de 030):
 *    se lee el contexto en un alcance corto, se habla con Zoom afuera y se
 *    guarda el resultado en otro alcance corto.
 *  - **Una corrida por organización**: el MISMO lease que la sincronización
 *    de grabaciones (`zoom_sync_state`), así no compiten por la misma cola
 *    de pedidos por conexión. El botón responde 409 si está tomado.
 *  - **Clases pasadas sin asistencia también** (decisión del dueño,
 *    2026-10-27): la cola toma toda clase real, dictada, no cancelada, sin
 *    una sola marca y con una reunión ubicable. Las de más de un año quedan
 *    "fuera de plazo" sin preguntarle a Zoom. Re-encolar no duplica (una
 *    fila por clase, `ON CONFLICT DO NOTHING`).
 *  - **Grupos finalizados afuera** (2026-10-27, `deGrupoFinalizado`, la
 *    regla de Académico): no se encolan, y lo que ya esperaba en la cola de
 *    un grupo que terminó SALE de ella (como `descartar`: nunca una lista,
 *    ambigua o confirmada). La clase queda como "todavía no se buscó" y el
 *    botón "Traer de Zoom" sigue andando a mano.
 *
 * Ubicar la instancia (en orden):
 *  1. La grabación ya adjudicada a la clase trae su UUID (`grabacion`).
 *  2. El aula vinculada a Zoom: reporte de reuniones de su usuario en el día
 *     y `elegirInstancia` por horario/número (`reporte_usuario`).
 *     [U] La referencia no garantiza `uuid` en ese reporte: si falta, o si
 *     ese scope no está ([U] el nombre granular), se cae a
 *  3. `/past_meetings/{número}/instances` filtrado por horario (`instancias`).
 *  4. Elegida a mano entre las candidatas de una "ambigua" (`manual`).
 */

/* ============================================================
 * Tipos y almacenamiento (inyectable: los tests usan uno en memoria)
 * ============================================================ */

export type CandidataGuardada = { uuid: string; startTime: string; topic: string | null; meetingId: string };

export type ClaseParaTraer = {
  classSessionId: string;
  timeZone: string;
  startsAt: Date;
  endsAt: Date | null;
  canceled: boolean;
  /** Número de la reunión efectiva (clase → grupo), si el enlace lo tiene. */
  meetingId: string | null;
  /** Aula efectiva vinculada a Zoom. */
  room: { zoomConnectionId: string; zoomUserId: string } | null;
  /** Grabación de Zoom adjudicada a la clase (ya trae el UUID). */
  recording: { uuid: string; zoomConnectionId: string; meetingId: string } | null;
  /** Conexiones activas (para una clase con enlace pero sin aula vinculada). */
  connectionIds: string[];
  fetch: {
    status: EstadoDeTraida;
    attempts: number;
    reviewedAt: Date | null;
    zoomConnectionId: string | null;
    candidates: CandidataGuardada[];
  } | null;
};

export type ResultadoDeTraida = {
  status: EstadoDeTraida;
  zoomConnectionId: string | null;
  zoomMeetingId: string | null;
  zoomMeetingUuid: string | null;
  instanceSource: "grabacion" | "reporte_usuario" | "instancias" | "manual" | null;
  attempts: number;
  nextAttemptAt: Date | null;
  fetchedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
  candidates: CandidataGuardada[];
  /** Solo con `lista`: reemplaza los tramos de la clase. */
  segmentos?: ZoomParticipantSegment[];
};

export interface AttendanceFetchStore {
  clase(orgId: string, classId: string): Promise<ClaseParaTraer | null>;
  guardar(orgId: string, classId: string, r: ResultadoDeTraida, now: Date): Promise<void>;
  /** Deja la clase en la cola (estado pendiente). No pisa una confirmada. */
  marcarPendiente(orgId: string, classId: string, now: Date): Promise<"ok" | "confirmada">;
  /**
   * Encola clases sin marcas y con reunión ubicable, salvo las de grupos
   * finalizados (y saca de la cola las que esperaban de esos grupos). Idempotente.
   */
  encolar(orgId: string, now: Date, delayMin: number): Promise<{ encoladas: number; fueraDePlazo: number }>;
  /** Las clases que toca traer ahora (más recientes primero), sin las de grupos finalizados. */
  pendientes(orgId: string, now: Date, limit: number): Promise<string[]>;
  tieneMarcas(orgId: string, classId: string): Promise<boolean>;
  /** Saca de la cola una clase que ya tiene asistencia (nunca una confirmada). */
  descartar(orgId: string, classId: string): Promise<void>;
  /** Borra los tramos crudos traídos antes de `antesDe`. */
  purgar(orgId: string, antesDe: Date, now: Date): Promise<number>;
}

export type AttendanceFetchDeps = {
  store: AttendanceFetchStore;
  lease: LeaseStore;
  zoom: {
    listMeetingParticipants: (c: ZoomCredentials, uuid: string) => Promise<ZoomParticipantSegment[]>;
    listUserPastMeetings: (
      c: ZoomCredentials,
      zoomUserId: string,
      range: { from: string; to: string }
    ) => Promise<ZoomPastMeeting[]>;
    listPastInstances: (c: ZoomCredentials, meetingId: string) => Promise<ZoomPastInstance[]>;
  };
  credentials: (orgId: string, connectionId: string) => Promise<ZoomCredentials>;
  now: () => Date;
  sleep: (ms: number) => Promise<void>;
  owner: string;
  config: {
    beforeMin: number;
    afterFallbackMin: number;
    delayMin: number;
    rawDays: number;
    batch: number;
    pauseMs: number;
  };
};

/* ============================================================
 * Ubicar la instancia
 * ============================================================ */

const DAY_MS = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

type Ubicada =
  | { kind: "unica"; uuid: string; meetingId: string; connectionId: string; source: ResultadoDeTraida["instanceSource"] }
  | { kind: "ambigua"; candidatas: CandidataGuardada[]; connectionId: string; meetingId: string | null }
  | { kind: "ninguna"; mensaje: string };

const SIN_AULA =
  "Esta clase no tiene un aula vinculada a Zoom ni un enlace de reunión. Vinculá el aula a Zoom o cargá el enlace de la reunión.";
const SIN_REUNION = "No hubo reunión de Zoom en esa aula en el horario de la clase.";

function guardable(c: InstanciaCandidata): CandidataGuardada | null {
  return c.uuid ? { uuid: c.uuid, startTime: c.startTime.toISOString(), topic: c.topic, meetingId: c.meetingId } : null;
}

async function porInstancias(
  creds: ZoomCredentials,
  clase: ClaseParaTraer,
  meetingId: string,
  deps: AttendanceFetchDeps
): Promise<ReturnType<typeof elegirInstancia>> {
  const instancias = await deps.zoom.listPastInstances(creds, meetingId);
  return elegirInstancia({
    clase: { startsAt: clase.startsAt, endsAt: clase.endsAt, meetingId },
    instancias: instancias.map((i) => ({ uuid: i.uuid, meetingId, startTime: i.startTime, topic: null })),
    tolerancia: { beforeMin: deps.config.beforeMin, afterFallbackMin: deps.config.afterFallbackMin },
  });
}

function aUbicada(
  r: ReturnType<typeof elegirInstancia>,
  connectionId: string,
  source: ResultadoDeTraida["instanceSource"]
): Ubicada | null {
  if (r.kind === "unica" && r.instancia.uuid) {
    return { kind: "unica", uuid: r.instancia.uuid, meetingId: r.instancia.meetingId, connectionId, source };
  }
  if (r.kind === "ambigua") {
    const candidatas = r.candidatas.map(guardable).filter((c): c is CandidataGuardada => c !== null);
    if (candidatas.length > 1) {
      return { kind: "ambigua", candidatas, connectionId, meetingId: r.candidatas[0]?.meetingId ?? null };
    }
    if (candidatas.length === 1) {
      const c = candidatas[0]!;
      return { kind: "unica", uuid: c.uuid, meetingId: c.meetingId, connectionId, source };
    }
  }
  return null;
}

async function ubicarInstancia(orgId: string, clase: ClaseParaTraer, deps: AttendanceFetchDeps): Promise<Ubicada> {
  // 1. La grabación adjudicada ya sabe cuál es.
  if (clase.recording) {
    return {
      kind: "unica",
      uuid: clase.recording.uuid,
      meetingId: clase.recording.meetingId,
      connectionId: clase.recording.zoomConnectionId,
      source: "grabacion",
    };
  }

  // 2. El aula vinculada: reporte de reuniones de su usuario ese día (±1 día
  //    por zonas horarias; Zoom acepta rangos de hasta un mes).
  if (clase.room) {
    const creds = await deps.credentials(orgId, clase.room.zoomConnectionId);
    const fin = clase.endsAt ?? new Date(clase.startsAt.getTime() + deps.config.afterFallbackMin * 60_000);
    let reporte: ReturnType<typeof elegirInstancia> | null = null;
    try {
      const reuniones = await deps.zoom.listUserPastMeetings(creds, clase.room.zoomUserId, {
        from: isoDay(clase.startsAt.getTime() - DAY_MS),
        to: isoDay(fin.getTime() + DAY_MS),
      });
      reporte = elegirInstancia({
        clase: { startsAt: clase.startsAt, endsAt: clase.endsAt, meetingId: clase.meetingId },
        instancias: reuniones,
        tolerancia: { beforeMin: deps.config.beforeMin, afterFallbackMin: deps.config.afterFallbackMin },
      });
    } catch (err) {
      // [U] Sin el scope del reporte de reuniones, todavía se puede por
      // instancias si la clase tiene número de reunión.
      if (!(err instanceof ZoomError && err.code === "sin_permiso" && clase.meetingId)) throw err;
    }
    if (reporte) {
      const directa = aUbicada(reporte, clase.room.zoomConnectionId, "reporte_usuario");
      if (directa) return directa;
    }
    // 3. Sin uuid en el reporte (o sin ese permiso): por instancias del número.
    const numero =
      reporte?.kind === "unica"
        ? reporte.instancia.meetingId
        : reporte?.kind === "ambigua"
          ? (reporte.candidatas[0]?.meetingId ?? null)
          : clase.meetingId;
    if (numero && (reporte === null || reporte.kind !== "ninguna" || clase.meetingId)) {
      const porNumero = aUbicada(await porInstancias(creds, clase, numero, deps), clase.room.zoomConnectionId, "instancias");
      if (porNumero) return porNumero;
    }
    return { kind: "ninguna", mensaje: SIN_REUNION };
  }

  // Sin aula vinculada pero con número: se prueba en cada cuenta conectada.
  if (clase.meetingId) {
    for (const connectionId of clase.connectionIds) {
      const creds = await deps.credentials(orgId, connectionId);
      try {
        const r = aUbicada(await porInstancias(creds, clase, clase.meetingId, deps), connectionId, "instancias");
        if (r) return r;
      } catch (err) {
        // 404 / 3001 en esta cuenta = la reunión no es de esta cuenta.
        if (!(err instanceof ZoomError && err.code === "no_terminada")) throw err;
      }
    }
    return { kind: "ninguna", mensaje: SIN_REUNION };
  }

  return { kind: "ninguna", mensaje: SIN_AULA };
}

/* ============================================================
 * Traer una clase
 * ============================================================ */

export type TraerResultado =
  | { ok: true; status: EstadoDeTraida }
  | { ok: false; error: "no_existe" | "cancelada" | "no_termino" | "ya_confirmada" | "candidata_invalida" };

function finDeClase(c: ClaseParaTraer, afterFallbackMin: number): Date {
  return c.endsAt ?? new Date(c.startsAt.getTime() + afterFallbackMin * 60_000);
}

/**
 * Trae el reporte de UNA clase y guarda el resultado. NUNCA lanza por Zoom:
 * todo fallo termina en un estado con mensaje propio. No escribe `attendance`.
 */
export async function traerAsistenciaDeClase(
  orgId: string,
  classId: string,
  opts: { uuidElegido?: string },
  deps: AttendanceFetchDeps
): Promise<TraerResultado> {
  const clase = await deps.store.clase(orgId, classId);
  if (!clase) return { ok: false, error: "no_existe" };
  if (clase.canceled) return { ok: false, error: "cancelada" };
  if (clase.fetch?.reviewedAt) return { ok: false, error: "ya_confirmada" };
  const ahora = deps.now();
  const fin = finDeClase(clase, deps.config.afterFallbackMin);
  if (fin.getTime() > ahora.getTime()) return { ok: false, error: "no_termino" };

  const intentos = (clase.fetch?.attempts ?? 0) + 1;
  const base: Omit<ResultadoDeTraida, "status"> = {
    zoomConnectionId: clase.fetch?.zoomConnectionId ?? null,
    zoomMeetingId: null,
    zoomMeetingUuid: null,
    instanceSource: null,
    attempts: intentos,
    nextAttemptAt: null,
    fetchedAt: null,
    errorCode: null,
    errorMessage: null,
    candidates: [],
  };

  if (fueraDelPlazoDeZoom(fin, ahora)) {
    await deps.store.guardar(orgId, classId, { ...base, status: "fuera_de_plazo", attempts: clase.fetch?.attempts ?? 0 }, ahora);
    return { ok: true, status: "fuera_de_plazo" };
  }

  let ubicada: Ubicada;
  if (opts.uuidElegido) {
    const elegida = clase.fetch?.candidates.find((c) => c.uuid === opts.uuidElegido);
    const conexion = clase.fetch?.zoomConnectionId;
    if (!elegida || !conexion) return { ok: false, error: "candidata_invalida" };
    ubicada = { kind: "unica", uuid: elegida.uuid, meetingId: elegida.meetingId, connectionId: conexion, source: "manual" };
  } else {
    try {
      ubicada = await ubicarInstancia(orgId, clase, deps);
    } catch (err) {
      return guardarFallo(orgId, classId, base, err, deps);
    }
  }

  if (ubicada.kind === "ninguna") {
    await deps.store.guardar(orgId, classId, { ...base, status: "sin_reunion", errorMessage: ubicada.mensaje }, ahora);
    return { ok: true, status: "sin_reunion" };
  }
  if (ubicada.kind === "ambigua") {
    await deps.store.guardar(
      orgId,
      classId,
      {
        ...base,
        status: "ambigua",
        zoomConnectionId: ubicada.connectionId,
        zoomMeetingId: ubicada.meetingId,
        candidates: ubicada.candidatas,
      },
      ahora
    );
    return { ok: true, status: "ambigua" };
  }

  const conInstancia = {
    ...base,
    zoomConnectionId: ubicada.connectionId,
    zoomMeetingId: ubicada.meetingId,
    zoomMeetingUuid: ubicada.uuid,
    instanceSource: ubicada.source,
    candidates: clase.fetch?.candidates ?? [],
  };
  let segmentos: ZoomParticipantSegment[];
  try {
    const creds = await deps.credentials(orgId, ubicada.connectionId);
    segmentos = await deps.zoom.listMeetingParticipants(creds, ubicada.uuid);
  } catch (err) {
    return guardarFallo(orgId, classId, conInstancia, err, deps);
  }

  // Reporte vacío o con todas las duraciones en 0: Zoom lo está procesando.
  if (segmentos.length === 0 || segmentos.every((s) => s.durationSec === 0)) {
    return guardarFallo(orgId, classId, conInstancia, new ZoomError("no_terminada", "Reporte sin procesar."), deps);
  }

  await deps.store.guardar(
    orgId,
    classId,
    { ...conInstancia, status: "lista", fetchedAt: deps.now(), segmentos },
    deps.now()
  );
  return { ok: true, status: "lista" };
}

async function guardarFallo(
  orgId: string,
  classId: string,
  base: Omit<ResultadoDeTraida, "status">,
  err: unknown,
  deps: AttendanceFetchDeps
): Promise<TraerResultado> {
  const code = err instanceof ZoomError ? err.code : "interno";
  const { estado, reintentar } = estadoPorError(code);
  const ahora = deps.now();
  await deps.store.guardar(
    orgId,
    classId,
    {
      ...base,
      status: estado,
      nextAttemptAt: reintentar ? proximoIntento(base.attempts, ahora) : null,
      errorCode: code,
      // Mensaje PROPIO (el del adaptador ya es propio y sin secretos).
      errorMessage: err instanceof ZoomError ? err.message : "Error inesperado al leer Zoom.",
    },
    ahora
  );
  if (!(err instanceof ZoomError)) {
    console.error("[zoom-asistencia] fallo interno:", err instanceof Error ? err.name : "error");
  }
  return { ok: true, status: estado };
}

/* ============================================================
 * La cola (periódica y "clases pasadas")
 * ============================================================ */

export type ColaResultado =
  | { ok: true; procesadas: number; encoladas: number; purgados: number }
  | { ok: false; error: "en_curso"; startedAt: Date | null };

/** Toma el lease (lo comparte con la sincronización de grabaciones). */
export async function tomarLease(orgId: string, deps: AttendanceFetchDeps) {
  return deps.lease.acquire(orgId, deps.owner, new Date(deps.now().getTime() + LEASE_MS));
}

/**
 * Procesa la cola de UNA organización con el lease YA tomado (lo libera al
 * final). Purga los crudos viejos, encola lo que falte y trae de a una clase
 * con pausa entre clases, hasta `max`. NUNCA lanza.
 */
export async function procesarColaConLease(
  orgId: string,
  opts: { max: number; encolar: boolean },
  deps: AttendanceFetchDeps
): Promise<{ procesadas: number; encoladas: number; purgados: number }> {
  let procesadas = 0;
  let encoladas = 0;
  let purgados = 0;
  try {
    try {
      purgados = await deps.store.purgar(orgId, new Date(deps.now().getTime() - deps.config.rawDays * DAY_MS), deps.now());
    } catch (err) {
      console.error("[zoom-asistencia] purga falló:", err instanceof Error ? err.name : "error");
    }
    if (opts.encolar) {
      encoladas = (await deps.store.encolar(orgId, deps.now(), deps.config.delayMin)).encoladas;
    }
    const vistas = new Set<string>();
    while (procesadas < opts.max) {
      const lote = (await deps.store.pendientes(orgId, deps.now(), Math.min(deps.config.batch, opts.max - procesadas)))
        .filter((id) => !vistas.has(id));
      if (lote.length === 0) break;
      for (const classId of lote) {
        vistas.add(classId);
        // La cola es para clases SIN asistencia: si alguien pasó lista
        // mientras tanto, no se le pregunta a Zoom.
        if (await deps.store.tieneMarcas(orgId, classId)) {
          await deps.store.descartar(orgId, classId);
          continue;
        }
        await traerAsistenciaDeClase(orgId, classId, {}, deps).catch((err: unknown) => {
          console.error("[zoom-asistencia] una clase falló:", err instanceof Error ? err.name : "error");
        });
        procesadas++;
        await deps.lease.renew(orgId, deps.owner, new Date(deps.now().getTime() + LEASE_MS)).catch(() => undefined);
        if (deps.config.pauseMs > 0) await deps.sleep(deps.config.pauseMs);
        if (procesadas >= opts.max) break;
      }
    }
  } catch (err) {
    console.error("[zoom-asistencia] la cola se interrumpió:", err instanceof Error ? err.name : "error");
  } finally {
    await deps.lease.release(orgId, deps.owner).catch(() => undefined);
  }
  return { procesadas, encoladas, purgados };
}

/** Lease + cola, para quien no responde a un pedido (periódica, tests). */
export async function procesarCola(
  orgId: string,
  opts: { max: number; encolar: boolean },
  deps: AttendanceFetchDeps = attendanceFetchDeps()
): Promise<ColaResultado> {
  const lease = await tomarLease(orgId, deps);
  if (!lease.ok) return { ok: false, error: "en_curso", startedAt: lease.startedAt };
  return { ok: true, ...(await procesarColaConLease(orgId, opts, deps)) };
}

/** "Traer de Zoom" de UNA clase con el lease ya tomado; lo libera. Nunca lanza. */
export async function traerConLease(
  orgId: string,
  classId: string,
  opts: { uuidElegido?: string },
  deps: AttendanceFetchDeps
): Promise<void> {
  try {
    await traerAsistenciaDeClase(orgId, classId, opts, deps);
  } catch (err) {
    console.error("[zoom-asistencia] traer falló:", err instanceof Error ? err.name : "error");
  } finally {
    await deps.lease.release(orgId, deps.owner).catch(() => undefined);
  }
}

/* ============================================================
 * Implementación sobre la base
 * ============================================================ */

const f = schema.zoomAttendanceFetch;
const sgm = schema.zoomParticipantSegment;
const cs = schema.classSession;

/** Clases con alguna marca de asistencia. */
function tieneMarcasSql() {
  return sql`exists (select 1 from ${schema.attendance} a where a.class_session_id = ${cs.id})`;
}

export const dbAttendanceFetchStore: AttendanceFetchStore = {
  clase(orgId, classId) {
    return inOrgScope(orgId, async () => {
      const db = getDb();
      const filas = await db
        .select({
          id: cs.id,
          date: cs.date,
          startTime: cs.startTime,
          endTime: cs.endTime,
          canceledAt: cs.canceledAt,
          classMeetingUrl: cs.meetingUrl,
          cohortMeetingUrl: schema.cohort.meetingUrl,
          roomId: sql<string | null>`coalesce(${cs.virtualRoomId}, ${schema.cohort.virtualRoomId})`,
          timezone: schema.organization.timezone,
        })
        .from(cs)
        .innerJoin(schema.cohort, eq(schema.cohort.id, cs.cohortId))
        .innerJoin(schema.organization, eq(schema.organization.id, cs.organizationId))
        .where(scoped(cs.organizationId, orgId, eq(cs.id, classId)))
        .limit(1);
      const c = filas[0];
      if (!c) return null;
      const timeZone = c.timezone ?? "America/Montevideo";
      const startsAt = classInstant(c.date, c.startTime, timeZone);
      if (!startsAt) return null;

      const [aula] = c.roomId
        ? await db
            .select({ zoomConnectionId: schema.virtualRoom.zoomConnectionId, zoomUserId: schema.virtualRoom.zoomUserId })
            .from(schema.virtualRoom)
            .innerJoin(schema.zoomConnection, eq(schema.zoomConnection.id, schema.virtualRoom.zoomConnectionId))
            .where(
              scoped(
                schema.virtualRoom.organizationId,
                orgId,
                eq(schema.virtualRoom.id, c.roomId),
                isNull(schema.zoomConnection.archivedAt)
              )
            )
            .limit(1)
        : [];
      const [grabacion] = await db
        .select({
          uuid: schema.zoomRecording.zoomMeetingUuid,
          zoomConnectionId: schema.zoomRecording.zoomConnectionId,
          meetingId: schema.zoomRecording.zoomMeetingId,
        })
        .from(schema.zoomRecording)
        .where(scoped(schema.zoomRecording.organizationId, orgId, eq(schema.zoomRecording.classSessionId, classId)))
        .limit(1);
      const conexiones = await db
        .select({ id: schema.zoomConnection.id })
        .from(schema.zoomConnection)
        .where(scoped(schema.zoomConnection.organizationId, orgId, isNull(schema.zoomConnection.archivedAt)));
      const [traida] = await db
        .select({
          status: f.status,
          attempts: f.attempts,
          reviewedAt: f.reviewedAt,
          zoomConnectionId: f.zoomConnectionId,
          candidates: f.candidates,
        })
        .from(f)
        .where(scoped(f.organizationId, orgId, eq(f.classSessionId, classId)))
        .limit(1);

      const meetingUrl = c.classMeetingUrl ?? c.cohortMeetingUrl ?? null;
      return {
        classSessionId: c.id,
        timeZone,
        startsAt,
        endsAt: classInstant(c.date, c.endTime, timeZone),
        canceled: c.canceledAt !== null,
        meetingId: extractMeetingId(meetingUrl),
        room:
          aula?.zoomConnectionId && aula.zoomUserId
            ? { zoomConnectionId: aula.zoomConnectionId, zoomUserId: aula.zoomUserId }
            : null,
        recording: grabacion ?? null,
        connectionIds: conexiones.map((x) => x.id),
        fetch: traida
          ? {
              status: traida.status,
              attempts: traida.attempts,
              reviewedAt: traida.reviewedAt,
              zoomConnectionId: traida.zoomConnectionId,
              candidates: traida.candidates,
            }
          : null,
      } satisfies ClaseParaTraer;
    });
  },

  guardar(orgId, classId, r, now) {
    return inOrgScope(orgId, async () => {
      const db = getDb();
      const valores = {
        status: r.status,
        zoomConnectionId: r.zoomConnectionId,
        zoomMeetingId: r.zoomMeetingId,
        zoomMeetingUuid: r.zoomMeetingUuid,
        instanceSource: r.instanceSource,
        attempts: r.attempts,
        nextAttemptAt: r.nextAttemptAt,
        fetchedAt: r.fetchedAt,
        errorCode: r.errorCode,
        errorMessage: r.errorMessage,
        candidates: r.candidates,
        updatedAt: now,
      };
      const [fila] = await db
        .insert(f)
        .values({ id: newId("zoomAttendanceFetch"), organizationId: orgId, classSessionId: classId, ...valores })
        .onConflictDoUpdate({
          target: f.classSessionId,
          set: valores,
          // Una clase ya confirmada no se pisa.
          setWhere: isNull(f.reviewedAt),
        })
        .returning({ id: f.id });
      if (!fila || r.status !== "lista" || !r.segmentos) return;
      await db.delete(sgm).where(scoped(sgm.organizationId, orgId, eq(sgm.fetchId, fila.id)));
      for (let i = 0; i < r.segmentos.length; i += 500) {
        await db
          .insert(sgm)
          .values(
            r.segmentos.slice(i, i + 500).map((s) => ({
              id: newId("zoomParticipantSegment"),
              organizationId: orgId,
              fetchId: fila.id,
              zoomParticipantId: s.participantId,
              participantUserId: s.participantUserId,
              registrantId: s.registrantId,
              displayName: s.name,
              email: s.email,
              joinTime: s.joinTime,
              leaveTime: s.leaveTime,
              durationSec: s.durationSec,
              breakout: s.breakout,
              waitingRoom: s.waitingRoom,
            }))
          )
          .onConflictDoNothing();
      }
    });
  },

  marcarPendiente(orgId, classId, now) {
    return inOrgScope(orgId, async () => {
      const db = getDb();
      const filas = await db
        .insert(f)
        .values({ id: newId("zoomAttendanceFetch"), organizationId: orgId, classSessionId: classId, status: "pendiente" })
        .onConflictDoUpdate({
          target: f.classSessionId,
          set: { status: "pendiente", nextAttemptAt: null, updatedAt: now },
          setWhere: isNull(f.reviewedAt),
        })
        .returning({ id: f.id });
      return filas.length > 0 ? "ok" : "confirmada";
    });
  },

  encolar(orgId, now, delayMin) {
    return inOrgScope(orgId, async () => {
      const db = getDb();
      // Clases reales, no canceladas, hasta hoy, que no son de un taller,
      // con alumnos, SIN marcas y sin fila en la cola. El corte exacto ("ya
      // terminó hace delayMin") va en JS con `classInstant`.
      const filas = await db
        .select({
          id: cs.id,
          date: cs.date,
          startTime: cs.startTime,
          endTime: cs.endTime,
          classMeetingUrl: cs.meetingUrl,
          cohortMeetingUrl: schema.cohort.meetingUrl,
          roomZoomUserId: schema.virtualRoom.zoomUserId,
          recordingId: schema.zoomRecording.id,
          timezone: schema.organization.timezone,
          cohortStartDate: schema.cohort.startDate,
          cohortEndDate: schema.cohort.endDate,
        })
        .from(cs)
        .innerJoin(schema.cohort, eq(schema.cohort.id, cs.cohortId))
        .innerJoin(schema.course, eq(schema.course.id, schema.cohort.courseId))
        .innerJoin(schema.organization, eq(schema.organization.id, cs.organizationId))
        .leftJoin(
          schema.virtualRoom,
          eq(schema.virtualRoom.id, sql`coalesce(${cs.virtualRoomId}, ${schema.cohort.virtualRoomId})`)
        )
        .leftJoin(schema.zoomRecording, eq(schema.zoomRecording.classSessionId, cs.id))
        .where(
          scoped(
            cs.organizationId,
            orgId,
            isNull(cs.canceledAt),
            lte(cs.date, new Date(now.getTime() + DAY_MS)),
            ne(schema.course.kind, "taller"),
            sql`not ${tieneMarcasSql()}`,
            notExists(db.select({ x: sql`1` }).from(f).where(eq(f.classSessionId, cs.id))),
            sql`exists (select 1 from ${schema.enrollment} e where e.cohort_id = ${cs.cohortId})`
          )
        );

      const nuevas: (typeof f.$inferInsert)[] = [];
      let fueraDePlazo = 0;
      for (const c of filas) {
        if (deGrupoFinalizado(c, now)) continue;
        const tz = c.timezone ?? "America/Montevideo";
        const inicio = classInstant(c.date, c.startTime, tz);
        if (!inicio) continue;
        const fin = classInstant(c.date, c.endTime, tz) ?? new Date(inicio.getTime() + 180 * 60_000);
        if (fin.getTime() + delayMin * 60_000 > now.getTime()) continue;
        const ubicable =
          c.recordingId !== null ||
          c.roomZoomUserId !== null ||
          extractMeetingId(c.classMeetingUrl ?? c.cohortMeetingUrl ?? null) !== null;
        if (!ubicable) continue;
        const vieja = fueraDelPlazoDeZoom(fin, now);
        if (vieja) fueraDePlazo++;
        nuevas.push({
          id: newId("zoomAttendanceFetch"),
          organizationId: orgId,
          classSessionId: c.id,
          status: vieja ? "fuera_de_plazo" : "pendiente",
          errorMessage: vieja ? "Zoom ya no guarda el reporte de esta clase (más de un año)." : null,
        });
      }
      for (let i = 0; i < nuevas.length; i += 500) {
        await db.insert(f).values(nuevas.slice(i, i + 500)).onConflictDoNothing();
      }

      // Lo que ya esperaba en la cola de un grupo que terminó sale de ella
      // (pendiente / no_lista / error sin confirmar; nunca una lista).
      const enCola = await db
        .select({ id: f.id, cohortStartDate: schema.cohort.startDate, cohortEndDate: schema.cohort.endDate })
        .from(f)
        .innerJoin(cs, eq(cs.id, f.classSessionId))
        .innerJoin(schema.cohort, eq(schema.cohort.id, cs.cohortId))
        .where(scoped(f.organizationId, orgId, isNull(f.reviewedAt), inArray(f.status, [...ESTADOS_REINTENTABLES])));
      const deTerminados = enCola.filter((x) => deGrupoFinalizado(x, now)).map((x) => x.id);
      for (let i = 0; i < deTerminados.length; i += 500) {
        await db
          .delete(f)
          .where(
            scoped(
              f.organizationId,
              orgId,
              inArray(f.id, deTerminados.slice(i, i + 500)),
              isNull(f.reviewedAt),
              inArray(f.status, [...ESTADOS_REINTENTABLES])
            )
          );
      }
      return { encoladas: nuevas.length - fueraDePlazo, fueraDePlazo };
    });
  },

  pendientes(orgId, now, limit) {
    return inOrgScope(orgId, async () => {
      // Sin LIMIT en SQL: los de grupos finalizados se saltean con la regla
      // única (`deGrupoFinalizado`) y no pueden tapar a los que siguen. Son
      // filas chicas (id y dos fechas).
      const filas = await getDb()
        .select({
          classSessionId: f.classSessionId,
          cohortStartDate: schema.cohort.startDate,
          cohortEndDate: schema.cohort.endDate,
        })
        .from(f)
        .innerJoin(cs, eq(cs.id, f.classSessionId))
        .innerJoin(schema.cohort, eq(schema.cohort.id, cs.cohortId))
        .where(
          scoped(
            f.organizationId,
            orgId,
            isNull(f.reviewedAt),
            inArray(f.status, [...ESTADOS_REINTENTABLES]),
            or(isNull(f.nextAttemptAt), lte(f.nextAttemptAt, now))
          )
        )
        .orderBy(desc(cs.date));
      return filas
        .filter((x) => !deGrupoFinalizado(x, now))
        .slice(0, limit)
        .map((x) => x.classSessionId);
    });
  },

  tieneMarcas(orgId, classId) {
    return inOrgScope(orgId, async () => {
      const [r] = await getDb()
        .select({ n: count() })
        .from(schema.attendance)
        .where(scoped(schema.attendance.organizationId, orgId, eq(schema.attendance.classSessionId, classId)));
      return (r?.n ?? 0) > 0;
    });
  },

  descartar(orgId, classId) {
    return inOrgScope(orgId, async () => {
      await getDb()
        .delete(f)
        .where(scoped(f.organizationId, orgId, eq(f.classSessionId, classId), isNull(f.reviewedAt), ne(f.status, "lista")));
    });
  },

  purgar(orgId, antesDe, now) {
    return inOrgScope(orgId, async () => {
      const db = getDb();
      const viejas = db
        .select({ id: f.id })
        .from(f)
        .where(and(eq(f.organizationId, orgId), lt(f.fetchedAt, antesDe)));
      const borrados = await db
        .delete(sgm)
        .where(scoped(sgm.organizationId, orgId, inArray(sgm.fetchId, viejas)))
        .returning({ id: sgm.id });
      // Una sugerencia sin sus tramos ya no se puede revisar: deja de ofrecerse.
      await db
        .update(f)
        .set({
          status: "fuera_de_plazo",
          errorMessage: "El detalle de Zoom de esta clase se borró (se guarda 180 días). Pasá la asistencia a mano.",
          updatedAt: now,
        })
        .where(scoped(f.organizationId, orgId, eq(f.status, "lista"), isNull(f.reviewedAt), lt(f.fetchedAt, antesDe)));
      return borrados.length;
    });
  },
};

export function attendanceFetchDeps(): AttendanceFetchDeps {
  const env = getEnv();
  return {
    store: dbAttendanceFetchStore,
    lease: dbLeaseStore,
    zoom: {
      listMeetingParticipants: zoomListMeetingParticipants,
      listUserPastMeetings: zoomListUserPastMeetings,
      listPastInstances: zoomListPastInstances,
    },
    credentials: (orgId, connectionId) => inOrgScope(orgId, () => loadZoomCredentials(orgId, connectionId)),
    now: () => new Date(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    owner: leaseOwner(),
    config: {
      beforeMin: env.ZOOM_MATCH_BEFORE_MIN,
      afterFallbackMin: env.ZOOM_MATCH_AFTER_FALLBACK_MIN,
      delayMin: env.ZOOM_ATTENDANCE_DELAY_MIN,
      rawDays: env.ZOOM_ATTENDANCE_RAW_DAYS,
      batch: env.ZOOM_ATTENDANCE_BATCH,
      pauseMs: env.ZOOM_ATTENDANCE_PAUSE_MS,
    },
  };
}
