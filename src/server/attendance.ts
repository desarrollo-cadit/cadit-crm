import { asc, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { etiquetaDeModulo, modulosConOrdinal } from "@/lib/program-order";
import { fechaEnReceso, recesosDeCohorte, type Receso } from "@/lib/recess";
import { leerRecesos } from "@/server/recesses";
import { resumenDeHoras } from "@/lib/class-hours";
import { ACADEMY_TIME_ZONE } from "@/lib/schedule-time";
import {
  attendancePercentage,
  estadoDeClase,
  type AttendanceStatus,
  type EstadoDeClase,
  type RelojDeAsistencia,
} from "@/lib/attendance-percentage";

/**
 * 009 — Clases dictadas y asistencia.
 *
 * El porcentaje se DERIVA siempre, nunca se persiste: depende de qué clases
 * se cancelaron y de cuándo entró cada alumno, y las dos cosas cambian
 * después de tomada la asistencia.
 */

export type { AttendanceStatus, RelojDeAsistencia } from "@/lib/attendance-percentage";
/**
 * 2026-10-21 — La regla del porcentaje vive en `src/lib/attendance-percentage.ts`
 * (solo clases DICTADAS, la marca cuenta siempre, inscripción contra el fin de
 * la clase). Se reexporta acá para los llamadores de siempre.
 */
export { attendancePercentage };

/**
 * 2026-10-21 — ¿Se TOMÓ asistencia en esta clase? (al menos una marca de
 * cualquiera). Va como columna de la MISMA consulta de clases —un `exists`—,
 * no como un viaje aparte: quien arma el porcentaje de UNA persona (legajo,
 * portal, escolaridad, empresa) solo tiene las marcas de esa persona, y sin
 * esto no puede distinguir "faltó" de "nadie pasó lista".
 */
export function asistenciaTomadaSql() {
  return sql<boolean>`exists (select 1 from ${schema.attendance} where ${schema.attendance.classSessionId} = ${schema.classSession.id})`;
}

/** Todas las columnas de `class_session` más `tomada`. */
export function columnasDeClaseConLista() {
  return { ...getTableColumns(schema.classSession), tomada: asistenciaTomadaSql() };
}

/**
 * El reloj con el que se pregunta "¿esta clase ya se dio?": la zona de la
 * organización y el instante. Una sola lectura para quien no la trae ya en su
 * propia consulta.
 */
export async function relojDeAsistencia(
  organizationId: string,
  now: Date = new Date()
): Promise<RelojDeAsistencia> {
  const rows = await getDb()
    .select({ timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  return { timeZone: rows[0]?.timezone ?? ACADEMY_TIME_ZONE, now };
}

export type ClassSessionDto = {
  id: string;
  number: number;
  date: string;
  startTime: string | null;
  endTime: string | null;
  hours: number | null;
  teacherId: string | null;
  topic: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
};

/* ============================================================
 * Funciones puras
 * ============================================================ */

/**
 * Arma el cronograma entre dos fechas para los días de la semana dictados.
 *
 * `daysOfWeek` es el CSV que ya usa el calendario (`0`=lunes..`6`=domingo).
 * Si la cohorte no declara días, no hay cronograma que generar: es preferible
 * devolver vacío y que la UI lo diga, antes que inventar una clase por día
 * y que alguien tenga que borrar cuarenta.
 */
export function buildClassSchedule(
  startDate: Date,
  endDate: Date,
  daysOfWeek: string | null,
  hoursPerClass: number | null,
  /**
   * 034 (FR-007) — Los recesos que alcanzan a esta cohorte (los de la academia
   * más los suyos, `recesosDeCohorte`). Un día de receso no genera clase ni se
   * proyecta, y la numeración sigue corrida: la clase 5 es la quinta que se
   * dicta, no la quinta que habría habido. Vacío = exactamente lo de antes.
   */
  recesos: readonly Pick<Receso, "fromDate" | "toDate">[] = []
): { number: number; date: Date; hours: number | null }[] {
  if (!daysOfWeek) return [];
  const days = new Set(
    daysOfWeek
      .split(",")
      .map((d) => Number(d.trim()))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  );
  if (days.size === 0) return [];
  if (endDate < startDate) return [];

  /*
    Todo en UTC: un día de clase es la medianoche UTC de ese día (así lo guarda
    el formulario y así lo leen `classInstant` y `formatDate`). Con la zona del
    PROCESO el cronograma dependía de dónde corriera el servidor, y en
    producción (UTC) el calendario de Montevideo pintaba cada clase un día antes.
  */
  const out: { number: number; date: Date; hours: number | null }[] = [];
  const cursor = new Date(startDate);
  cursor.setUTCHours(0, 0, 0, 0);
  const last = new Date(endDate);
  last.setUTCHours(23, 59, 59, 999);

  while (cursor <= last) {
    // getUTCDay(): 0=domingo..6=sábado. El calendario usa 0=lunes..6=domingo.
    const index = (cursor.getUTCDay() + 6) % 7;
    if (days.has(index) && !fechaEnReceso(cursor, recesos)) {
      out.push({ number: out.length + 1, date: new Date(cursor), hours: hoursPerClass });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/**
 * Mínimo para aprobar: manda la cohorte, y si no declaró nada hereda del curso
 * (DV-001). `null` en los dos = la cohorte no exige presencia.
 */
export function resolveMinAttendance(
  cohortPct: number | null,
  coursePct: number | null
): number | null {
  return cohortPct ?? coursePct;
}

/**
 * 028 (DV-009) — Una camada de especialización NO tiene clases propias.
 *
 * Vive acá, junto a `generateSchedule`, y lo importa `classes.ts` para que el
 * motivo que se muestra en pantalla y el que rechaza la generación sean el
 * MISMO texto. Dos frases distintas para la misma regla es cómo aparece una
 * pantalla que promete lo que el servidor después niega.
 *
 * El motivo no es purismo: una clase colgada del padre no pertenece a ningún
 * módulo y rompe la pregunta "¿de qué módulo es esta clase?", que es
 * justamente la que el ciclo 028 viene a contestar. La clase inaugural del
 * programa se carga como clase del módulo 1.
 */
export const CAMADA_CON_MODULOS_SIN_CLASES =
  "Este grupo es una especialización: las clases se cargan en cada módulo, no en el grupo padre.";

/**
 * 028 (FR-030, regla 5) — La asistencia de un recorrido, MÓDULO POR MÓDULO.
 *
 * Devuelve un porcentaje por inscripción hija y **nunca** uno agregado: "la
 * asistencia de la especialización" no es un dato que exista. Cada módulo
 * tiene su cronograma, su duración y su propio mínimo (DV-002); promediar
 * ocho meses en un número sería inventar un criterio que nadie decidió.
 *
 * Es PURA: recibe las filas ya leídas y las cruza en memoria. Lo que fija es
 * la cadena que la base **no** protege (decisión 3): `class_session.cohort_id`
 * apunta a la cohorte del módulo y `attendance.enrollment_id` a la inscripción
 * hija. No hay clave foránea que obligue a que coincidan —y esa laxitud es la
 * que vuelve representable la recursada en otra camada—, así que la coherencia
 * la sostiene esta función y el test que la acompaña (FR-037).
 *
 * Una sesión de la camada PADRE no aparece en el `cohortId` de ningún módulo,
 * así que no aporta a nadie: DV-009 se cumple por construcción.
 */
export function attendanceByModule(
  modulos: readonly {
    enrollmentId: string;
    cohortId: string | null;
    enrolledAt: Date | null;
  }[],
  sesiones: readonly {
    id: string;
    cohortId: string;
    date: Date;
    /** Para saber si la clase ya terminó (`classHasEnded`); sin horario, el fin del día. */
    endTime?: string | null;
    canceledAt: Date | null;
    /**
     * ¿Alguien pasó lista? (`asistenciaTomadaSql`). Sin el dato se deduce de
     * las marcas recibidas, que pueden no ser las de todo el grupo.
     */
    tomada?: boolean;
  }[],
  marcas: readonly {
    enrollmentId: string;
    classSessionId: string;
    status: AttendanceStatus;
  }[],
  /** 2026-10-21 — Solo cuentan las clases ya dictadas: la zona y el "ahora". */
  reloj: RelojDeAsistencia
): Map<string, number | null> {
  const out = new Map<string, number | null>();

  for (const m of modulos) {
    const mias = marcas.filter((k) => k.enrollmentId === m.enrollmentId);

    /**
     * 013 (T034), repetido acá a propósito — **0% porque nadie pasó lista NO
     * es 0% porque no vino.** En la planilla de la cohorte el 0 está bien: el
     * coordinador sabe que todavía no cargó nada. En el recorrido de una
     * persona es una acusación, y encima una que después decide si aprueba.
     */
    if (!m.cohortId || mias.length === 0) {
      out.set(m.enrollmentId, null);
      continue;
    }

    const propias = sesiones.filter((s) => s.cohortId === m.cohortId);
    const conMarcas = new Set(marcas.map((k) => k.classSessionId));
    out.set(
      m.enrollmentId,
      attendancePercentage(
        propias.map((s) => ({
          sessionDate: s.date,
          endTime: s.endTime ?? null,
          canceled: Boolean(s.canceledAt),
          tomada: Boolean(s.tomada) || conMarcas.has(s.id),
          status: mias.find((k) => k.classSessionId === s.id)?.status ?? null,
        })),
        m.enrolledAt,
        reloj
      )
    );
  }

  return out;
}

/* ============================================================
 * Operaciones sobre la base
 * ============================================================ */

export type AttendanceResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

/**
 * Genera el cronograma de una cohorte. Es una acción EXPLÍCITA (DV-003): dar
 * de alta cuarenta clases que nadie pidió es difícil de deshacer.
 */
export async function generateSchedule(
  organizationId: string,
  cohortId: string
): Promise<AttendanceResult<ClassSessionDto[]>> {
  const db = getDb();

  const rows = await db
    .select()
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const cohort = rows[0];
  if (!cohort) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }

  /**
   * 028 (DV-009) — La camada de una especialización no genera cronograma.
   *
   * Se pregunta por la PRESENCIA de módulos (FR-033), no por una bandera, y
   * se pregunta acá y no en la pantalla: generar cuarenta clases que no
   * pertenecen a ningún módulo es difícil de deshacer, y el endpoint se puede
   * llamar sin pasar por el botón.
   *
   * Cuesta una consulta que las 33 cohortes simples también pagan. Se acepta
   * porque `generateSchedule` es una acción explícita y única —no un listado—,
   * y porque la alternativa (deducirlo del nombre del curso) es exactamente la
   * heurística que FR-033 prohíbe.
   */
  const modulos = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.parentCohortId, cohortId)
      )
    )
    .limit(1);
  // 028 (seguimiento) — La marca también cuenta: una especialización todavía
  // sin módulos tampoco tiene clases propias, y generarlas ahora dejaría
  // cuarenta clases huérfanas el día que se le agregue el primero.
  if (cohort.isSpecialization || modulos.length > 0) {
    return {
      ok: false,
      status: 422,
      code: "camada_con_modulos",
      message: CAMADA_CON_MODULOS_SIN_CLASES,
    };
  }

  if (!cohort.endDate) {
    return {
      ok: false,
      status: 422,
      code: "no_end_date",
      message: "El grupo todavía no tiene fecha de fin. Cuando la cargues, vas a poder generar el cronograma.",
    };
  }
  if (!cohort.daysOfWeek) {
    return {
      ok: false,
      status: 422,
      code: "no_days",
      message: "El grupo todavía no tiene días de cursada. Cuando los cargues, vas a poder generar el cronograma.",
    };
  }

  const existing = await db
    .select({ id: schema.classSession.id })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, cohortId)
      )
    );
  if (existing.length > 0) {
    return {
      ok: false,
      status: 409,
      code: "schedule_exists",
      message: "El grupo ya tiene cronograma. Borralo antes de regenerarlo.",
    };
  }

  const hoursPerClass = hoursFromTimes(cohort.startTime, cohort.endTime);
  // 034 (FR-007, SC-003) — Regenerar después de cargar un receso no crea
  // ninguna clase dentro del receso: los de la academia y los de la cohorte.
  const recesos = recesosDeCohorte(await leerRecesos(db, organizationId, [cohortId]), cohortId);
  const plan = buildClassSchedule(
    cohort.startDate,
    cohort.endDate,
    cohort.daysOfWeek,
    hoursPerClass,
    recesos
  );
  if (plan.length === 0) {
    return {
      ok: false,
      status: 422,
      code: "empty_schedule",
      message: "El rango de fechas y los días de cursada no producen ninguna clase",
    };
  }

  await db.insert(schema.classSession).values(
    plan.map((p) => ({
      id: newId("classSession"),
      organizationId,
      cohortId,
      number: p.number,
      date: p.date,
      startTime: cohort.startTime,
      endTime: cohort.endTime,
      hours: p.hours,
      teacherId: cohort.teacherId,
    }))
  );

  return { ok: true, data: await listSessions(organizationId, cohortId) };
}

/**
 * "18:30"–"20:30" -> 2. Null si falta alguna o el rango no cierra.
 *
 * Es el valor que se GUARDA en `class_session.hours`, que es una columna
 * entera: por eso redondea. Las horas dictadas (staff y portal) NO suman esta
 * columna: se calculan exactas del horario con `resumenDeHoras`
 * (`src/lib/class-hours.ts`), y la columna solo cuenta si la clase no tiene
 * horario.
 */
export function hoursFromTimes(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  const toMinutes = (t: string) => {
    const m = t.match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  };
  const a = toMinutes(start);
  const b = toMinutes(end);
  if (a === null || b === null || b <= a) return null;
  return Math.round((b - a) / 60);
}

/* ============================================================
 * 029 — El cronograma de TODOS los módulos de una especialización
 * ============================================================ */

type ModuloParaCronograma = {
  id: string;
  name: string | null;
  courseName: string;
  position: number | null;
  startDate: Date;
  endDate: Date | null;
  daysOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  teacherId: string | null;
};

export type MotivoDeSalteo = "ya_tiene_clases" | "sin_fecha_fin" | "sin_dias" | "sin_clases";

export type CronogramaDelProgramaDto = {
  generated: { cohortId: string; label: string; classes: number }[];
  skipped: { cohortId: string; label: string; reason: MotivoDeSalteo; message: string }[];
};

const MOTIVO_DE_SALTEO: Record<MotivoDeSalteo, string> = {
  ya_tiene_clases: "Ya tiene cronograma: no se regenera para no duplicar clases.",
  sin_fecha_fin: "No tiene fecha de fin.",
  sin_dias: "No declara días de cursada.",
  sin_clases: "El rango de fechas y los días de cursada no producen ninguna clase.",
};

/**
 * PURA — Qué se genera y qué se saltea, módulo por módulo.
 *
 * Cada módulo es una cohorte y se planifica con `buildClassSchedule`, la misma
 * función que usa `generateSchedule`: no hay una segunda regla para "todos".
 * Un módulo que no se puede generar NO frena a los demás; se dice por qué.
 */
export function planDeCronogramaDelPrograma(
  modulos: readonly ModuloParaCronograma[],
  conClases: ReadonlySet<string>,
  /** 034 (FR-007) — Todos los recesos que alcanzan a algún módulo; se filtran por módulo. */
  recesos: readonly Pick<Receso, "fromDate" | "toDate" | "cohortId">[] = []
) {
  const filas: {
    cohortId: string;
    number: number;
    date: Date;
    startTime: string | null;
    endTime: string | null;
    hours: number | null;
    teacherId: string | null;
  }[] = [];
  const resumen: CronogramaDelProgramaDto = { generated: [], skipped: [] };

  for (const m of modulosConOrdinal(modulos)) {
    const label = etiquetaDeModulo(m.ordinal, m.name ?? m.courseName);
    const saltear = (reason: MotivoDeSalteo) =>
      resumen.skipped.push({ cohortId: m.id, label, reason, message: MOTIVO_DE_SALTEO[reason] });

    if (conClases.has(m.id)) {
      saltear("ya_tiene_clases");
      continue;
    }
    if (!m.endDate) {
      saltear("sin_fecha_fin");
      continue;
    }
    if (!m.daysOfWeek?.trim()) {
      saltear("sin_dias");
      continue;
    }
    const plan = buildClassSchedule(
      m.startDate,
      m.endDate,
      m.daysOfWeek,
      hoursFromTimes(m.startTime, m.endTime),
      recesosDeCohorte(recesos, m.id)
    );
    if (plan.length === 0) {
      saltear("sin_clases");
      continue;
    }
    for (const p of plan) {
      filas.push({
        cohortId: m.id,
        number: p.number,
        date: p.date,
        startTime: m.startTime,
        endTime: m.endTime,
        hours: p.hours,
        teacherId: m.teacherId,
      });
    }
    resumen.generated.push({ cohortId: m.id, label, classes: plan.length });
  }

  return { filas, ...resumen };
}

/**
 * 029 — Genera el cronograma de cada módulo que todavía no tiene, en UN
 * insert. La ruta corre dentro de la transacción de `withAuth`, así que o
 * entran todas las clases o ninguna.
 *
 * Solo sobre una especialización (la marca o la presencia de módulos, como
 * `generateSchedule` al revés): en una cohorte común esto no tiene sentido.
 */
export async function generateProgramSchedule(
  organizationId: string,
  cohortId: string
): Promise<AttendanceResult<CronogramaDelProgramaDto>> {
  const db = getDb();

  const [madre] = await db
    .select({ id: schema.cohort.id, isSpecialization: schema.cohort.isSpecialization })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!madre) {
    return { ok: false, status: 404, code: "not_found", message: "Grupo no encontrado" };
  }

  const modulos = await db
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      courseName: schema.course.name,
      position: schema.cohort.position,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      daysOfWeek: schema.cohort.daysOfWeek,
      startTime: schema.cohort.startTime,
      endTime: schema.cohort.endTime,
      teacherId: schema.cohort.teacherId,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.parentCohortId, cohortId)
      )
    );
  if (!madre.isSpecialization && modulos.length === 0) {
    return {
      ok: false,
      status: 422,
      code: "not_a_program",
      message: "Este grupo no es una especialización: generá su cronograma desde su pestaña Clases.",
    };
  }
  if (modulos.length === 0) return { ok: true, data: { generated: [], skipped: [] } };

  const conClases = new Set(
    (
      await db
        .selectDistinct({ cohortId: schema.classSession.cohortId })
        .from(schema.classSession)
        .where(
          scoped(
            schema.classSession.organizationId,
            organizationId,
            inArray(
              schema.classSession.cohortId,
              modulos.map((m) => m.id)
            )
          )
        )
    ).map((r) => r.cohortId)
  );

  const recesos = await leerRecesos(
    db,
    organizationId,
    modulos.map((m) => m.id)
  );
  const { filas, generated, skipped } = planDeCronogramaDelPrograma(modulos, conClases, recesos);
  if (filas.length > 0) {
    await db
      .insert(schema.classSession)
      .values(filas.map((f) => ({ id: newId("classSession"), organizationId, ...f })));
  }
  return { ok: true, data: { generated, skipped } };
}

export async function listSessions(
  organizationId: string,
  cohortId: string
): Promise<ClassSessionDto[]> {
  const rows = await getDb()
    .select()
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, cohortId)
      )
    )
    // 034 — por FECHA: una reprogramación lleva el último número pero va en su día.
    .orderBy(asc(schema.classSession.date), asc(schema.classSession.number));
  return rows.map((s) => ({
    id: s.id,
    number: s.number,
    date: s.date.toISOString(),
    startTime: s.startTime,
    endTime: s.endTime,
    hours: s.hours,
    teacherId: s.teacherId,
    topic: s.topic,
    canceledAt: s.canceledAt?.toISOString() ?? null,
    cancelReason: s.cancelReason,
  }));
}

/**
 * Marca la asistencia de un alumno en una clase. Volver a marcar CORRIGE la
 * marca anterior en vez de crear otra (índice único por clase + inscripción):
 * el caso normal es rectificar un error de tipeo, no llevar dos registros.
 */
export async function markAttendance(
  organizationId: string,
  classSessionId: string,
  entries: {
    enrollmentId: string;
    status: AttendanceStatus;
    notes?: string | null;
    /** 0080 — Minutos conectado según Zoom (solo con `origen: "zoom"`). */
    zoomMinutes?: number | null;
  }[],
  /**
   * 014 (DV-001) — Quién marca. Con el portal, la asistencia deja de tocarla
   * solo la coordinación, y una corrección sin autor no se puede revisar.
   */
  recordedBy?: string | null,
  /**
   * 2026-10-21 — "Todos presentes": escribe solo donde NO hay marca, en la
   * misma sentencia (ON CONFLICT DO NOTHING). La pantalla calcula a quién
   * marcar con lo que tenía cargado; si alguien marcó a un alumno mientras
   * tanto, su marca gana.
   */
  opciones: {
    soloSinMarca?: boolean;
    /**
     * 0080 — De dónde sale la marca. `zoom` SOLO desde la confirmación de la
     * sugerencia de Zoom (`confirmarAsistenciaDeZoom`): una persona la miró.
     */
    origen?: "manual" | "zoom";
  } = {}
): Promise<AttendanceResult<{ marked: number }>> {
  const db = getDb();

  const sessionRows = await db
    .select({ id: schema.classSession.id, canceledAt: schema.classSession.canceledAt })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    )
    .limit(1);
  const session = sessionRows[0];
  if (!session) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }
  if (session.canceledAt) {
    return {
      ok: false,
      status: 422,
      code: "session_canceled",
      message: "La clase está cancelada: no se puede tomar asistencia",
    };
  }
  if (entries.length === 0) return { ok: true, data: { marked: 0 } };

  /**
   * 029 — UNA sentencia para toda la planilla, no una por alumno.
   *
   * Postgres rechaza un INSERT … ON CONFLICT que toca la misma fila dos veces,
   * así que una inscripción repetida se compacta antes: gana la ÚLTIMA, que es
   * lo que dejaba el bucle de antes.
   */
  const ultimaPorInscripcion = new Map<string, (typeof entries)[number]>();
  for (const e of entries) ultimaPorInscripcion.set(e.enrollmentId, e);

  const now = new Date();
  const filas = [...ultimaPorInscripcion.values()].map((e) => ({
    id: newId("attendance"),
    organizationId,
    classSessionId,
    enrollmentId: e.enrollmentId,
    status: e.status,
    notes: e.notes ?? null,
    recordedBy: recordedBy ?? null,
    source: opciones.origen ?? ("manual" as const),
    zoomMinutes: opciones.origen === "zoom" ? (e.zoomMinutes ?? null) : null,
  }));

  if (opciones.soloSinMarca) {
    const escritas = await db
      .insert(schema.attendance)
      .values(filas)
      .onConflictDoNothing({
        target: [schema.attendance.classSessionId, schema.attendance.enrollmentId],
      })
      .returning({ id: schema.attendance.id });
    return { ok: true, data: { marked: escritas.length } };
  }

  await db
    .insert(schema.attendance)
    .values(filas)
    .onConflictDoUpdate({
      target: [schema.attendance.classSessionId, schema.attendance.enrollmentId],
      set: {
        status: sql`excluded.status`,
        notes: sql`excluded.notes`,
        // La corrección pisa al autor anterior: quien vale es quien dejó el
        // dato como está ahora, no quien lo puso mal la primera vez.
        recordedBy: sql`excluded.recorded_by`,
        // Una corrección a mano de una marca de Zoom deja de ser de Zoom.
        source: sql`excluded.source`,
        zoomMinutes: sql`excluded.zoom_minutes`,
        updatedAt: now,
      },
    });

  return { ok: true, data: { marked: ultimaPorInscripcion.size } };
}

/** Cancela una clase. Deja de contar para el porcentaje de todos (FR-004). */
export async function cancelSession(
  organizationId: string,
  classSessionId: string,
  reason: string
): Promise<AttendanceResult<ClassSessionDto>> {
  const db = getDb();
  const updated = await db
    .update(schema.classSession)
    .set({ canceledAt: new Date(), cancelReason: reason, updatedAt: new Date() })
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    )
    .returning();
  const s = updated[0];
  if (!s) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }
  return {
    ok: true,
    data: {
      id: s.id,
      number: s.number,
      date: s.date.toISOString(),
      startTime: s.startTime,
      endTime: s.endTime,
      hours: s.hours,
      teacherId: s.teacherId,
      topic: s.topic,
      canceledAt: s.canceledAt?.toISOString() ?? null,
      cancelReason: s.cancelReason,
    },
  };
}

export type CohortAttendanceDto = {
  minAttendancePct: number | null;
  /**
   * 2026-10-21 — Cada clase viaja con su `estado` (`estadoDeClase`): la
   * pantalla atenúa las futuras y no las deja editar, sin recalcular zonas
   * horarias en el navegador.
   */
  sessions: (ClassSessionDto & {
    estado: EstadoDeClase;
    /** Alguien pasó lista en esta clase: solo entonces cuenta para el %. */
    tomada: boolean;
  })[];
  students: {
    enrollmentId: string;
    contactName: string;
    percentage: number | null;
    /** null cuando la cohorte no exige presencia o todavía no hay clases. */
    meetsMinimum: boolean | null;
    bySession: Record<string, AttendanceStatus>;
  }[];
};

/** Planilla completa de la cohorte: clases, alumnos y porcentaje derivado. */
export async function cohortAttendance(
  organizationId: string,
  cohortId: string,
  now: Date = new Date()
): Promise<CohortAttendanceDto | null> {
  const db = getDb();

  const cohortRows = await db
    .select({
      id: schema.cohort.id,
      minAttendancePct: schema.cohort.minAttendancePct,
      courseMinPct: schema.course.minAttendancePct,
      // En la MISMA consulta: "¿ya se dio esta clase?" depende de la zona.
      timezone: schema.organization.timezone,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .innerJoin(schema.organization, eq(schema.cohort.organizationId, schema.organization.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const cohort = cohortRows[0];
  if (!cohort) return null;

  const reloj: RelojDeAsistencia = { timeZone: cohort.timezone ?? ACADEMY_TIME_ZONE, now };
  const minPct = resolveMinAttendance(cohort.minAttendancePct, cohort.courseMinPct);
  const sessions = (await listSessions(organizationId, cohortId)).map((s) => ({
    ...s,
    estado: estadoDeClase(
      { sessionDate: new Date(s.date), endTime: s.endTime, canceled: Boolean(s.canceledAt) },
      reloj
    ),
  }));

  const enrollments = await db
    .select({
      id: schema.enrollment.id,
      enrolledAt: schema.enrollment.enrolledAt,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.cohortId, cohortId)
      )
    )
    .orderBy(asc(schema.contact.firstName));

  const marks = await db
    .select()
    .from(schema.attendance)
    .innerJoin(
      schema.classSession,
      eq(schema.attendance.classSessionId, schema.classSession.id)
    )
    .where(
      scoped(
        schema.attendance.organizationId,
        organizationId,
        eq(schema.classSession.cohortId, cohortId)
      )
    );

  const tomadas = new Set(marks.map((m) => m.attendance.classSessionId));
  const byEnrollment = new Map<string, Map<string, AttendanceStatus>>();
  for (const m of marks) {
    const row = m.attendance;
    const map = byEnrollment.get(row.enrollmentId) ?? new Map<string, AttendanceStatus>();
    map.set(row.classSessionId, row.status);
    byEnrollment.set(row.enrollmentId, map);
  }

  return {
    minAttendancePct: minPct,
    sessions: sessions.map((s) => ({ ...s, tomada: tomadas.has(s.id) })),
    students: enrollments.map((e) => {
      const map = byEnrollment.get(e.id) ?? new Map<string, AttendanceStatus>();
      const percentage = attendancePercentage(
        sessions.map((s) => ({
          sessionDate: new Date(s.date),
          endTime: s.endTime,
          canceled: Boolean(s.canceledAt),
          status: map.get(s.id) ?? null,
          tomada: tomadas.has(s.id),
        })),
        e.enrolledAt,
        reloj
      );
      return {
        enrollmentId: e.id,
        contactName: [e.firstName, e.lastName].filter(Boolean).join(" "),
        percentage,
        meetsMinimum:
          minPct === null || percentage === null ? null : percentage >= minPct,
        bySession: Object.fromEntries(map),
      };
    }),
  };
}

/**
 * Clases dictadas y horas de un profesor: lo que multiplica `hourly_rate`.
 *
 * La MISMA cuenta que ve el profesor en su portal (`teacherOwnHours`):
 * `resumenDeHoras` de `src/lib/class-hours.ts`. Dictada = ya terminó en la
 * zona de la academia y no está cancelada; horas exactas (1,5 y no 2).
 */
export async function teacherHours(
  organizationId: string,
  teacherId: string,
  now: Date = new Date()
): Promise<{ sessions: number; hours: number }> {
  const db = getDb();
  const org = await db
    .select({ timezone: schema.organization.timezone })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const rows = await db
    .select({
      cohortId: schema.classSession.cohortId,
      date: schema.classSession.date,
      startTime: schema.classSession.startTime,
      endTime: schema.classSession.endTime,
      hours: schema.classSession.hours,
    })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.teacherId, teacherId),
        isNull(schema.classSession.canceledAt)
      )
    );
  const resumen = resumenDeHoras(
    rows.map((r) => ({ ...r, cohortName: null, courseName: null })),
    org[0]?.timezone ?? ACADEMY_TIME_ZONE,
    now
  );
  return { sessions: resumen.sessions, hours: resumen.hours };
}
