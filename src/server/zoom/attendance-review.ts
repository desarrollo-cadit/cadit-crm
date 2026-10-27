import { eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { ACADEMY_TIME_ZONE, classInstant } from "@/lib/schedule-time";
import type { AttendanceStatus } from "@/lib/attendance-percentage";
import {
  agruparPersonas,
  armarSugerencia,
  llavesDePersona,
  planDeConfirmacion,
  UMBRALES_DE_FABRICA,
  type AliasAprendido,
  type AlumnoDelGrupo,
  type PersonaExcluida,
  type PersonaSinIdentificar,
  type SegmentoZoom,
  type SugerenciaDeAlumno,
  type Umbrales,
} from "@/lib/zoom-attendance";
import { mensajeDeEstado, type EstadoDeTraida } from "@/lib/zoom-attendance-estado";
import { markAttendance } from "@/server/attendance";
import { currentRun } from "./lease";

/**
 * Asistencia sugerida desde Zoom (constitución 1.9.0) — revisar y confirmar.
 *
 * - La SUGERENCIA se calcula al leer (`armarSugerencia`) sobre los tramos
 *   crudos, lo aprendido y la lista del grupo de ESA clase. No se guarda: lo
 *   que se aprende corrigiendo la clase 3 mejora enseguida la clase 4.
 * - **Lo único que escribe `attendance` es `confirmarAsistenciaDeZoom`**,
 *   llamada por una persona con `asistencia.editar` (la marca guarda su
 *   autor, origen `zoom` y los minutos). Por defecto solo completa a quien
 *   NO tiene marca; pisar una marca existente pide marcarla a propósito.
 * - Corre dentro de la transacción del pedido: ninguna llamada a Zoom acá.
 */

const FALLBACK_FIN_MIN = 180;

export type MarcaActual = { status: AttendanceStatus; source: "manual" | "zoom" | null };

export type AlumnoSugeridoDto = Omit<SugerenciaDeAlumno, "primeraEntrada"> & {
  primeraEntrada: string | null;
  marcaActual: MarcaActual | null;
};

export type ZoomAttendanceDto = {
  /** La organización tiene alguna conexión de Zoom activa. */
  zoomConectado: boolean;
  /** Hay una corrida de Zoom en curso (traer o sincronizar). */
  enCurso: boolean;
  traida: {
    estado: EstadoDeTraida;
    mensaje: string;
    intentos: number;
    proximoIntento: string | null;
    traidaEl: string | null;
    candidatas: { uuid: string; startTime: string; topic: string | null }[];
    revisadaEl: string | null;
    revisadaPor: string | null;
  } | null;
  sugerencia: {
    umbralMinutos: number;
    duracionMinutos: number;
    alumnos: AlumnoSugeridoDto[];
    sinIdentificar: (Omit<PersonaSinIdentificar, "primeraEntrada"> & { primeraEntrada: string | null })[];
    excluidas: PersonaExcluida[];
  } | null;
};

/* ============================================================
 * Lectura
 * ============================================================ */

type Contexto = {
  fetch: typeof schema.zoomAttendanceFetch.$inferSelect;
  ventana: { inicio: Date; fin: Date };
  timeZone: string;
  segmentos: SegmentoZoom[];
  alumnos: AlumnoDelGrupo[];
  aliases: AliasAprendido[];
  exclusiones: { correos: string[]; zoomUserIds: string[] };
  umbrales: Umbrales;
};

export async function umbralesDeLaOrganizacion(organizationId: string): Promise<Umbrales> {
  const [fila] = await getDb()
    .select({
      minPct: schema.zoomAttendanceSettings.minPct,
      minMinutes: schema.zoomAttendanceSettings.minMinutes,
      lateMinutes: schema.zoomAttendanceSettings.lateMinutes,
    })
    .from(schema.zoomAttendanceSettings)
    .where(scoped(schema.zoomAttendanceSettings.organizationId, organizationId))
    .limit(1);
  return fila ?? UMBRALES_DE_FABRICA;
}

/** Carga todo lo que hace falta para sugerir UNA clase (o null si no hay traída). */
async function cargarContexto(organizationId: string, classId: string): Promise<{
  clase: { cohortId: string; teacherId: string | null; cohortTeacherId: string | null };
  ctx: Contexto | null;
  fetch: typeof schema.zoomAttendanceFetch.$inferSelect | null;
  timeZone: string;
} | null> {
  const db = getDb();
  const cs = schema.classSession;
  const [c] = await db
    .select({
      cohortId: cs.cohortId,
      date: cs.date,
      startTime: cs.startTime,
      endTime: cs.endTime,
      teacherId: cs.teacherId,
      cohortTeacherId: schema.cohort.teacherId,
      roomId: cs.virtualRoomId,
      cohortRoomId: schema.cohort.virtualRoomId,
      timezone: schema.organization.timezone,
    })
    .from(cs)
    .innerJoin(schema.cohort, eq(schema.cohort.id, cs.cohortId))
    .innerJoin(schema.organization, eq(schema.organization.id, cs.organizationId))
    .where(scoped(cs.organizationId, organizationId, eq(cs.id, classId)))
    .limit(1);
  if (!c) return null;
  const timeZone = c.timezone ?? ACADEMY_TIME_ZONE;
  const clase = { cohortId: c.cohortId, teacherId: c.teacherId, cohortTeacherId: c.cohortTeacherId };

  const [fetch] = await db
    .select()
    .from(schema.zoomAttendanceFetch)
    .where(
      scoped(schema.zoomAttendanceFetch.organizationId, organizationId, eq(schema.zoomAttendanceFetch.classSessionId, classId))
    )
    .limit(1);
  const inicio = classInstant(c.date, c.startTime, timeZone);
  if (!fetch || fetch.status !== "lista" || !inicio) return { clase, ctx: null, fetch: fetch ?? null, timeZone };
  const fin = classInstant(c.date, c.endTime, timeZone) ?? new Date(inicio.getTime() + FALLBACK_FIN_MIN * 60_000);

  const segs = await db
    .select()
    .from(schema.zoomParticipantSegment)
    .where(
      scoped(
        schema.zoomParticipantSegment.organizationId,
        organizationId,
        eq(schema.zoomParticipantSegment.fetchId, fetch.id)
      )
    );
  const segmentos: SegmentoZoom[] = segs.map((s) => ({
    participantId: s.zoomParticipantId,
    participantUserId: s.participantUserId,
    registrantId: s.registrantId,
    name: s.displayName,
    email: s.email,
    joinTime: s.joinTime,
    leaveTime: s.leaveTime,
    breakout: s.breakout,
    waitingRoom: s.waitingRoom,
  }));

  // La lista del grupo de ESTA clase: lo aprendido nunca asigna afuera.
  const inscriptos = await db
    .select({
      enrollmentId: schema.enrollment.id,
      contactId: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
      secondaryEmail: schema.contact.secondaryEmail,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.contact.id, schema.enrollment.contactId))
    .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.cohortId, c.cohortId)));
  const alumnos: AlumnoDelGrupo[] = inscriptos
    .map((i) => ({
      enrollmentId: i.enrollmentId,
      contactId: i.contactId,
      nombre: [i.firstName, i.lastName].filter(Boolean).join(" "),
      correos: [i.email, i.secondaryEmail].filter((x): x is string => Boolean(x)),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  // Lo aprendido: solo las llaves que traen las personas de esta reunión.
  const llaves = [...new Set(agruparPersonas(segmentos).flatMap((p) => llavesDePersona(p).map((l) => l.key)))];
  const aliasRows = llaves.length
    ? await db
        .select()
        .from(schema.zoomParticipantAlias)
        .where(
          scoped(
            schema.zoomParticipantAlias.organizationId,
            organizationId,
            inArray(schema.zoomParticipantAlias.key, llaves)
          )
        )
    : [];
  const aliases: AliasAprendido[] = aliasRows.map((a) => ({
    keyKind: a.keyKind,
    key: a.key,
    contactId: a.contactId,
    ignorar: a.ignorar,
    confirmations: a.confirmations,
    rejections: a.rejections,
    rejectedContactIds: a.rejectedContactIds,
  }));

  // Exclusiones: el aula (anfitrión), el profesor y su suplente, el equipo.
  const roomId = c.roomId ?? c.cohortRoomId;
  const [aula] = roomId
    ? await db
        .select({ zoomUserId: schema.virtualRoom.zoomUserId, zoomUserEmail: schema.virtualRoom.zoomUserEmail })
        .from(schema.virtualRoom)
        .where(scoped(schema.virtualRoom.organizationId, organizationId, eq(schema.virtualRoom.id, roomId)))
        .limit(1)
    : [];
  const profesores = [c.teacherId, c.cohortTeacherId].filter((x): x is string => Boolean(x));
  const correosDeProfesores = profesores.length
    ? await db
        .select({ email: schema.teacher.email })
        .from(schema.teacher)
        .where(
          scoped(schema.teacher.organizationId, organizationId, inArray(schema.teacher.id, profesores), isNotNull(schema.teacher.email))
        )
    : [];
  // `member` no tiene RLS: se acota a mano (ver CLAUDE.md, "RLS").
  const equipo = await db
    .select({ email: schema.user.email })
    .from(schema.member)
    .innerJoin(schema.user, eq(schema.user.id, schema.member.userId))
    .where(eq(schema.member.organizationId, organizationId));
  const correosDelGrupo = new Set(alumnos.flatMap((a) => a.correos.map((x) => x.toLowerCase())));
  const exclusiones = {
    // Una persona del equipo que además cursa en el grupo NO se excluye.
    correos: [aula?.zoomUserEmail, ...correosDeProfesores.map((p) => p.email), ...equipo.map((e) => e.email)]
      .filter((x): x is string => Boolean(x))
      .map((x) => x.toLowerCase())
      .filter((x) => !correosDelGrupo.has(x)),
    zoomUserIds: aula?.zoomUserId ? [aula.zoomUserId] : [],
  };

  return {
    clase,
    fetch,
    timeZone,
    ctx: {
      fetch,
      ventana: { inicio, fin },
      timeZone,
      segmentos,
      alumnos,
      aliases,
      exclusiones,
      umbrales: await umbralesDeLaOrganizacion(organizationId),
    },
  };
}

function sugerir(ctx: Contexto) {
  return armarSugerencia({
    segmentos: ctx.segmentos,
    ventana: ctx.ventana,
    alumnos: ctx.alumnos,
    aliases: ctx.aliases,
    exclusiones: ctx.exclusiones,
    umbrales: ctx.umbrales,
  });
}

async function marcasActuales(organizationId: string, classId: string): Promise<Map<string, MarcaActual>> {
  const filas = await getDb()
    .select({
      enrollmentId: schema.attendance.enrollmentId,
      status: schema.attendance.status,
      source: schema.attendance.source,
    })
    .from(schema.attendance)
    .where(scoped(schema.attendance.organizationId, organizationId, eq(schema.attendance.classSessionId, classId)));
  return new Map(filas.map((f) => [f.enrollmentId, { status: f.status, source: f.source ?? null }]));
}

/** La sugerencia de Zoom de UNA clase, para el panel de Asistencia. */
export async function sugerenciaDeZoom(organizationId: string, classId: string): Promise<ZoomAttendanceDto | null> {
  const db = getDb();
  const cargado = await cargarContexto(organizationId, classId);
  if (!cargado) return null;
  const conexiones = await db
    .select({ id: schema.zoomConnection.id })
    .from(schema.zoomConnection)
    .where(scoped(schema.zoomConnection.organizationId, organizationId))
    .limit(1);
  const enCurso = (await currentRun(organizationId)) !== null;

  const f = cargado.fetch;
  let revisadaPor: string | null = null;
  if (f?.reviewedBy) {
    const [u] = await db.select({ name: schema.user.name }).from(schema.user).where(eq(schema.user.id, f.reviewedBy)).limit(1);
    revisadaPor = u?.name ?? null;
  }

  const traida: ZoomAttendanceDto["traida"] = f
    ? {
        estado: f.status,
        mensaje: mensajeDeEstado({
          estado: f.status,
          proximo: f.nextAttemptAt,
          detalle: f.errorMessage,
          timeZone: cargado.timeZone,
        }),
        intentos: f.attempts,
        proximoIntento: f.nextAttemptAt?.toISOString() ?? null,
        traidaEl: f.fetchedAt?.toISOString() ?? null,
        candidatas: f.candidates.map((c) => ({ uuid: c.uuid, startTime: c.startTime, topic: c.topic })),
        revisadaEl: f.reviewedAt?.toISOString() ?? null,
        revisadaPor,
      }
    : null;

  let sugerencia: ZoomAttendanceDto["sugerencia"] = null;
  if (cargado.ctx) {
    const s = sugerir(cargado.ctx);
    const marcas = await marcasActuales(organizationId, classId);
    sugerencia = {
      umbralMinutos: s.umbralMinutos,
      duracionMinutos: s.duracionMinutos,
      alumnos: s.alumnos.map((a) => ({
        ...a,
        primeraEntrada: a.primeraEntrada?.toISOString() ?? null,
        marcaActual: marcas.get(a.enrollmentId) ?? null,
      })),
      sinIdentificar: s.sinIdentificar.map((p) => ({ ...p, primeraEntrada: p.primeraEntrada?.toISOString() ?? null })),
      excluidas: s.excluidas,
    };
  }

  return { zoomConectado: conexiones.length > 0, enCurso, traida, sugerencia };
}

/* ============================================================
 * Confirmar (lo ÚNICO que escribe asistencia desde Zoom)
 * ============================================================ */

export type DecisionDeAlumno = { enrollmentId: string; status: AttendanceStatus; personaKeys: string[] };

export type Confirmacion = {
  decisions: DecisionDeAlumno[];
  /** "Es del equipo o un dispositivo". */
  ignore: string[];
  /** "No es esta persona" (sin reasignar). */
  rejected: string[];
  /** Inscripciones con marca previa que se pisan A PROPÓSITO. */
  overwrite: string[];
};

export type ConfirmarResultado =
  | { ok: true; data: { escritas: number; salteadas: number; aprendidas: number } }
  | { ok: false; status: number; code: string; message: string };

export async function confirmarAsistenciaDeZoom(
  organizationId: string,
  classId: string,
  userId: string,
  body: Confirmacion,
  now: Date = new Date()
): Promise<ConfirmarResultado> {
  const cargado = await cargarContexto(organizationId, classId);
  if (!cargado) return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  if (cargado.fetch?.reviewedAt) {
    return { ok: false, status: 409, code: "ya_confirmada", message: "Esta sugerencia ya se confirmó." };
  }
  const ctx = cargado.ctx;
  if (!ctx) {
    return { ok: false, status: 422, code: "sin_sugerencia", message: "Esta clase no tiene una sugerencia de Zoom lista." };
  }

  const marcas = await marcasActuales(organizationId, classId);
  const plan = planDeConfirmacion({ ...ctx, conMarca: new Set(marcas.keys()), cuerpo: body });
  if (!plan.ok) return { ok: false, status: 422, code: plan.code, message: plan.message };

  // Se RECLAMA la sugerencia antes de escribir: si dos personas confirman a
  // la vez, la segunda recibe 409 sin haber tocado nada.
  const db = getDb();
  const f = schema.zoomAttendanceFetch;
  const reclamada = await db
    .update(f)
    .set({ reviewedAt: now, reviewedBy: userId, updatedAt: now })
    .where(scoped(f.organizationId, organizationId, eq(f.id, ctx.fetch.id), isNull(f.reviewedAt)))
    .returning({ id: f.id });
  if (reclamada.length === 0) {
    return { ok: false, status: 409, code: "ya_confirmada", message: "Esta sugerencia ya se confirmó." };
  }
  const soltar = () =>
    db.update(f).set({ reviewedAt: null, reviewedBy: null }).where(scoped(f.organizationId, organizationId, eq(f.id, ctx.fetch.id)));

  let escritas = 0;
  if (plan.nuevas.length > 0) {
    // Solo donde no hay marca, en la misma sentencia: si alguien marcó
    // mientras tanto, gana su marca.
    const r = await markAttendance(organizationId, classId, plan.nuevas, userId, {
      soloSinMarca: true,
      origen: "zoom",
    });
    if (!r.ok) {
      await soltar();
      return r;
    }
    escritas += r.data.marked;
  }
  if (plan.pisadas.length > 0) {
    const r = await markAttendance(organizationId, classId, plan.pisadas, userId, { origen: "zoom" });
    if (!r.ok) {
      await soltar();
      return r;
    }
    escritas += r.data.marked;
  }
  const ops = plan.aprender;
  const a = schema.zoomParticipantAlias;
  for (const op of ops) {
    const valores = {
      label: op.label.slice(0, 200),
      contactId: op.contactId,
      ignorar: op.ignorar,
      confirmations: op.confirmations,
      rejections: op.rejections,
      rejectedContactIds: op.rejectedContactIds,
      lastUsedAt: now,
      updatedAt: now,
    };
    await db
      .insert(a)
      .values({
        id: newId("zoomParticipantAlias"),
        organizationId,
        keyKind: op.keyKind,
        key: op.key,
        createdBy: userId,
        ...valores,
      })
      .onConflictDoUpdate({ target: [a.organizationId, a.keyKind, a.key], set: valores });
  }

  return {
    ok: true,
    data: { escritas, salteadas: plan.salteadas, aprendidas: ops.length },
  };
}

