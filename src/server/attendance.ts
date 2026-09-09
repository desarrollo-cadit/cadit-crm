import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * 009 — Clases dictadas y asistencia.
 *
 * El porcentaje se DERIVA siempre, nunca se persiste: depende de qué clases
 * se cancelaron y de cuándo entró cada alumno, y las dos cosas cambian
 * después de tomada la asistencia.
 */

export type AttendanceStatus = "presente" | "tarde" | "ausente" | "justificado";

/**
 * `tarde` cuenta como PRESENTE (DV-002): se registra para que el dato quede,
 * pero no penaliza el porcentaje. `justificado` tampoco descuenta —es una
 * ausencia con aviso—, pero SÍ sale del numerador: el alumno no estuvo.
 */
const CUENTA_COMO_PRESENTE: ReadonlySet<AttendanceStatus> = new Set<AttendanceStatus>([
  "presente",
  "tarde",
]);

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
  hoursPerClass: number | null
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

  const out: { number: number; date: Date; hours: number | null }[] = [];
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const last = new Date(endDate);
  last.setHours(23, 59, 59, 999);

  while (cursor <= last) {
    // getDay(): 0=domingo..6=sábado. El calendario usa 0=lunes..6=domingo.
    const index = (cursor.getDay() + 6) % 7;
    if (days.has(index)) {
      out.push({ number: out.length + 1, date: new Date(cursor), hours: hoursPerClass });
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

export type AttendanceInput = {
  sessionDate: Date;
  canceled: boolean;
  status: AttendanceStatus | null;
};

/**
 * Porcentaje de asistencia de UN alumno.
 *
 * El denominador tiene dos reglas que lo separan de un `count` cualquiera
 * (FR-004):
 *  - las clases CANCELADAS no cuentan; si no, cancelar una clase le baja la
 *    asistencia a toda la cohorte;
 *  - las clases ANTERIORES a su inscripción tampoco; el que entra en la
 *    cuarta semana no arranca con tres semanas de faltas.
 *
 * Sin clases elegibles devuelve `null` y NO 0: "todavía no hay de qué
 * calcular" y "vino a cero clases" son cosas distintas, y mostrar 0% en una
 * cohorte que no empezó es una mentira que alguien va a usar para decidir.
 */
export function attendancePercentage(
  sessions: AttendanceInput[],
  enrolledAt: Date | null
): number | null {
  const eligible = sessions.filter(
    (s) => !s.canceled && (!enrolledAt || s.sessionDate >= enrolledAt)
  );
  if (eligible.length === 0) return null;
  const present = eligible.filter(
    (s) => s.status !== null && CUENTA_COMO_PRESENTE.has(s.status)
  ).length;
  return Math.round((present / eligible.length) * 100);
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
  "Esta camada es una especialización: las clases se cargan en cada módulo, no en la camada padre.";

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
    canceledAt: Date | null;
  }[],
  marcas: readonly {
    enrollmentId: string;
    classSessionId: string;
    status: AttendanceStatus;
  }[]
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
    out.set(
      m.enrollmentId,
      attendancePercentage(
        propias.map((s) => ({
          sessionDate: s.date,
          canceled: Boolean(s.canceledAt),
          status: mias.find((k) => k.classSessionId === s.id)?.status ?? null,
        })),
        m.enrolledAt
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
    return { ok: false, status: 404, code: "not_found", message: "Cohorte no encontrada" };
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
  if (modulos.length > 0) {
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
      message: "La cohorte no tiene fecha de fin: no se puede generar el cronograma",
    };
  }
  if (!cohort.daysOfWeek) {
    return {
      ok: false,
      status: 422,
      code: "no_days",
      message: "La cohorte no declara días de cursada. Cargalos y volvé a generar.",
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
      message: "La cohorte ya tiene cronograma. Borralo antes de regenerarlo.",
    };
  }

  const hoursPerClass = hoursFromTimes(cohort.startTime, cohort.endTime);
  const plan = buildClassSchedule(
    cohort.startDate,
    cohort.endDate,
    cohort.daysOfWeek,
    hoursPerClass
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

/** "18:30"–"20:30" -> 2. Null si falta alguna o el rango no cierra. */
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
    .orderBy(asc(schema.classSession.number));
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
  entries: { enrollmentId: string; status: AttendanceStatus; notes?: string | null }[],
  /**
   * 014 (DV-001) — Quién marca. Con el portal, la asistencia deja de tocarla
   * solo la coordinación, y una corrección sin autor no se puede revisar.
   */
  recordedBy?: string | null
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

  const now = new Date();
  for (const e of entries) {
    await db
      .insert(schema.attendance)
      .values({
        id: newId("attendance"),
        organizationId,
        classSessionId,
        enrollmentId: e.enrollmentId,
        status: e.status,
        notes: e.notes ?? null,
        recordedBy: recordedBy ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.attendance.classSessionId, schema.attendance.enrollmentId],
        set: {
          status: e.status,
          notes: e.notes ?? null,
          // La corrección pisa al autor anterior: quien vale es quien dejó el
          // dato como está ahora, no quien lo puso mal la primera vez.
          recordedBy: recordedBy ?? null,
          updatedAt: now,
        },
      });
  }

  return { ok: true, data: { marked: entries.length } };
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
  sessions: ClassSessionDto[];
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
  cohortId: string
): Promise<CohortAttendanceDto | null> {
  const db = getDb();

  const cohortRows = await db
    .select({
      id: schema.cohort.id,
      minAttendancePct: schema.cohort.minAttendancePct,
      courseMinPct: schema.course.minAttendancePct,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  const cohort = cohortRows[0];
  if (!cohort) return null;

  const minPct = resolveMinAttendance(cohort.minAttendancePct, cohort.courseMinPct);
  const sessions = await listSessions(organizationId, cohortId);

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
      and(
        eq(schema.attendance.organizationId, organizationId),
        eq(schema.classSession.cohortId, cohortId)
      )
    );

  const byEnrollment = new Map<string, Map<string, AttendanceStatus>>();
  for (const m of marks) {
    const row = m.attendance;
    const map = byEnrollment.get(row.enrollmentId) ?? new Map<string, AttendanceStatus>();
    map.set(row.classSessionId, row.status);
    byEnrollment.set(row.enrollmentId, map);
  }

  return {
    minAttendancePct: minPct,
    sessions,
    students: enrollments.map((e) => {
      const map = byEnrollment.get(e.id) ?? new Map<string, AttendanceStatus>();
      const percentage = attendancePercentage(
        sessions.map((s) => ({
          sessionDate: new Date(s.date),
          canceled: Boolean(s.canceledAt),
          status: map.get(s.id) ?? null,
        })),
        e.enrolledAt
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

/** Clases dictadas y horas de un profesor: lo que multiplica `hourly_rate`. */
export async function teacherHours(
  organizationId: string,
  teacherId: string
): Promise<{ sessions: number; hours: number }> {
  const rows = await getDb()
    .select({ hours: schema.classSession.hours })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.teacherId, teacherId),
        isNull(schema.classSession.canceledAt)
      )
    );
  return {
    sessions: rows.length,
    hours: rows.reduce((sum, r) => sum + (r.hours ?? 0), 0),
  };
}
