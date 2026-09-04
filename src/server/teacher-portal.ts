import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { markAttendance, type AttendanceStatus } from "@/server/attendance";
import { listCohortClasses, type ClassRowDto, type CohortClassesDto } from "@/server/classes";
import { computeCohortStatus } from "@/server/courses";
import { cohortGrading, recordResults, type AssessmentDto } from "@/server/grading";
import {
  createResource,
  listAnnouncements,
  listResources,
  type AnnouncementDto,
  type ResourceDto,
} from "@/server/resources";
import type { ResourceKind } from "@/lib/db/schema";

/**
 * 014 (fase 3) — El ALCANCE del profesor: qué cohortes puede tocar.
 *
 * Este archivo es la superficie propia del portal (FR-008). No reusa los
 * endpoints del staff, ni siquiera el roster, y la tentación es fuerte porque
 * el roster ya existe y hace casi lo mismo. Casi. El roster trae correo y
 * teléfono del alumno, que el profesor **no debe ver** (DV-004), y trae el
 * estado de cuenta, que menos. Reusarlo es exactamente cómo un campo
 * financiero termina en la pantalla equivocada.
 *
 * Regla de oro del archivo: **un dato que el profesor no debe ver no se
 * consulta**. No se consulta, no se arma y no viaja. Esconderlo en la UI sería
 * dejarlo en la respuesta HTTP.
 */

/* ============================================================
 * El alcance
 * ============================================================ */

/**
 * Las cohortes que este profesor alcanza: donde es el titular **o** donde
 * dictó alguna clase (FR-001).
 *
 * La suplencia cuenta y no es un detalle: quien cubrió una clase tiene que
 * poder cargar la asistencia de ESA clase, y no puede hacerlo si el sistema
 * solo mira `cohort.teacher_id`. Por eso `class_session.teacher_id` existe
 * desde 009 — la clase sabe quién la dictó, la cohorte sabe quién es el
 * titular, y son dos preguntas distintas.
 *
 * Una sola regla, en un solo lugar: todo lo demás del portal pregunta por acá.
 */
export async function resolveTeacherScope(
  organizationId: string,
  teacherId: string
): Promise<string[]> {
  const db = getDb();

  const [titular, suplencias] = await Promise.all([
    db
      .select({ id: schema.cohort.id })
      .from(schema.cohort)
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          eq(schema.cohort.teacherId, teacherId)
        )
      ),
    db
      .selectDistinct({ id: schema.classSession.cohortId })
      .from(schema.classSession)
      .where(
        scoped(
          schema.classSession.organizationId,
          organizationId,
          eq(schema.classSession.teacherId, teacherId)
        )
      ),
  ]);

  const ids = new Set<string>();
  for (const r of titular) ids.add(r.id);
  for (const r of suplencias) ids.add(r.id);
  return [...ids];
}

/**
 * ¿Este profesor alcanza esta cohorte?
 *
 * **Devuelve un booleano, no una respuesta HTTP, a propósito.** Quien decide
 * el código de estado es la ruta, y la respuesta correcta cuando NO alcanza es
 * **404, no 403** (SC-002): un 403 confirma que la cohorte existe, y eso ya es
 * información que el profesor no tenía. La forma de que nadie lo rompa con
 * buena intención es que acá no haya un 403 que copiar.
 */
export async function teacherReachesCohort(
  organizationId: string,
  teacherId: string,
  cohortId: string
): Promise<boolean> {
  const db = getDb();

  const rows = await db
    .select({ id: schema.cohort.id })
    .from(schema.cohort)
    .leftJoin(
      schema.classSession,
      and(
        eq(schema.classSession.cohortId, schema.cohort.id),
        eq(schema.classSession.teacherId, teacherId)
      )
    )
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.id, cohortId),
        or(
          eq(schema.cohort.teacherId, teacherId),
          eq(schema.classSession.teacherId, teacherId)
        )
      )
    )
    .limit(1);

  return rows.length > 0;
}

/* ============================================================
 * Lo que ve
 * ============================================================ */

/**
 * Una cohorte, como la ve el profesor.
 *
 * Lo que NO está es la mitad del diseño: sin `cost`, sin `currency`, sin
 * cuotas, sin pagos y sin datos de contacto de nadie. `role` distingue al
 * titular del suplente porque el profesor necesita saber por qué le aparece
 * una cohorte que no es suya.
 */
export type TeacherCohortDto = {
  id: string;
  /** La cohorte puede no tener nombre propio; ahí manda el del curso. */
  name: string | null;
  courseName: string;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  classroom: string | null;
  /**
   * 023 (FR-010) / 025 — En qué AULA le toca dictar: solo el nombre.
   *
   * La `url` viajaba acá y ya no. El aula es la CUENTA de Zoom, y su sala es
   * la misma para todas las cohortes que la usan: mandar al profesor por ahí
   * lo podía dejar en la clase de otro. Para entrar está el enlace de cada
   * clase, que sale de la reunión recurrente de ESTA cohorte.
   *
   * Se saca del DTO y no solo de la pantalla porque un dato que no se debe
   * usar no se esconde: no viaja.
   */
  virtualRoom: { name: string } | null;
  status: "planificada" | "en_curso" | "finalizada";
  role: "titular" | "suplente";
  students: number;
};

/** Las cohortes de este profesor, la más reciente primero. */
export async function listTeacherCohorts(
  organizationId: string,
  teacherId: string
): Promise<TeacherCohortDto[]> {
  const alcance = await resolveTeacherScope(organizationId, teacherId);
  if (alcance.length === 0) return [];

  const db = getDb();

  const rows = await db
    .select({
      id: schema.cohort.id,
      name: schema.cohort.name,
      teacherId: schema.cohort.teacherId,
      startDate: schema.cohort.startDate,
      endDate: schema.cohort.endDate,
      startTime: schema.cohort.startTime,
      endTime: schema.cohort.endTime,
      classroom: schema.cohort.classroom,
      courseName: schema.course.name,
      roomName: schema.virtualRoom.name,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.virtualRoom, eq(schema.cohort.virtualRoomId, schema.virtualRoom.id))
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        inArray(schema.cohort.id, alcance)
      )
    );

  const inscriptos = await db
    .select({ cohortId: schema.enrollment.cohortId })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        inArray(schema.enrollment.cohortId, alcance)
      )
    );

  const cuantos = new Map<string, number>();
  for (const e of inscriptos) {
    // `enrollment.cohort_id` es nulo cuando la inscripción todavía no eligió
    // edición: esa persona no cuenta como alumno de ninguna cohorte.
    if (!e.cohortId) continue;
    cuantos.set(e.cohortId, (cuantos.get(e.cohortId) ?? 0) + 1);
  }

  return rows
    .map((c) => ({
      id: c.id,
      name: c.name,
      courseName: c.courseName,
      startDate: c.startDate.toISOString(),
      endDate: c.endDate?.toISOString() ?? null,
      startTime: c.startTime,
      endTime: c.endTime,
      classroom: c.classroom,
      virtualRoom: c.roomName ? { name: c.roomName } : null,
      status: computeCohortStatus(c.startDate, c.endDate),
      role: c.teacherId === teacherId ? ("titular" as const) : ("suplente" as const),
      students: cuantos.get(c.id) ?? 0,
    }))
    // Con 18 cohortes (las de Ovidio) el orden no es cosmético: lo que está en
    // curso es lo único que se usa un martes a las 18:30.
    .sort((a, b) => b.startDate.localeCompare(a.startDate));
}

/**
 * Un alumno, como lo ve el profesor: **el nombre y nada más** (DV-004).
 *
 * No hay `email`, no hay `phone` y no hay `waIdentity`. El profesor toma
 * asistencia y corrige; para hablar con un alumno está la academia.
 */
export type TeacherStudentDto = {
  enrollmentId: string;
  name: string;
};

export type TeacherCohortDetailDto = {
  cohort: TeacherCohortDto;
  students: TeacherStudentDto[];
  /** DV-005 — una cohorte finalizada se VE, no se edita. */
  editable: boolean;
};

/**
 * El detalle de una cohorte del profesor, o `null` si no la alcanza.
 *
 * `null` y no una excepción con código: la ruta lo traduce a 404 y así el
 * "no existe" y el "no es tuya" son indistinguibles desde afuera (SC-002).
 */
export async function teacherCohortDetail(
  organizationId: string,
  teacherId: string,
  cohortId: string
): Promise<TeacherCohortDetailDto | null> {
  if (!(await teacherReachesCohort(organizationId, teacherId, cohortId))) return null;

  const cohortes = await listTeacherCohorts(organizationId, teacherId);
  const cohort = cohortes.find((c) => c.id === cohortId);
  if (!cohort) return null;

  const rows = await getDb()
    .select({
      enrollmentId: schema.enrollment.id,
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

  return {
    cohort,
    students: rows.map((r) => ({
      enrollmentId: r.enrollmentId,
      name: [r.firstName, r.lastName].filter(Boolean).join(" "),
    })),
    editable: cohort.status !== "finalizada",
  };
}

/* ============================================================
 * Lo que hace
 * ============================================================
 * Todas las funciones de acá abajo empiezan igual: preguntan por el alcance y
 * devuelven `null` si no lo tienen. `null` es "no existe para vos" — la ruta
 * lo traduce a 404 y el profesor ajeno ve lo mismo que vería pidiendo una
 * cohorte inventada.
 */

export type TeacherClassesDto = {
  cohort: TeacherCohortDto;
  editable: boolean;
  /**
   * 025 — Sin `ownMeetingUrl`: al profesor le viajan las filas de ENTRAR, no
   * las de editar. El enlace crudo es la carga de coordinación, y hacerlo
   * viajar acá lo pondría fuera de la ventana horaria sin que ninguna
   * pantalla lo pida.
   */
  classes: Omit<CohortClassesDto, "classes"> & { classes: ClassRowDto[] };
};

/** Las clases de una cohorte del profesor, o `null` si no la alcanza. */
export async function teacherCohortClasses(
  organizationId: string,
  teacherId: string,
  cohortId: string,
  now: Date = new Date()
): Promise<TeacherClassesDto | null> {
  const detalle = await teacherCohortDetail(organizationId, teacherId, cohortId);
  if (!detalle) return null;

  const classes = await listCohortClasses(organizationId, cohortId, now);
  if (!classes) return null;

  // No viaja, no se filtra: se descarta acá, no en la pantalla (FR-008).
  const sinCrudos = classes.classes.map(({ ownMeetingUrl: _crudo, ...fila }) => fila);

  return {
    cohort: detalle.cohort,
    editable: detalle.editable,
    classes: { ...classes, classes: sinCrudos },
  };
}

export type TeacherAttendanceSheetDto = {
  classSession: {
    id: string;
    number: number;
    date: string;
    topic: string | null;
    canceled: boolean;
  };
  cohort: TeacherCohortDto;
  editable: boolean;
  students: (TeacherStudentDto & {
    status: AttendanceStatus | null;
    /** DV-001 — quién dejó la marca así, y cuándo. */
    recordedByName: string | null;
    recordedAt: string | null;
  })[];
};

/**
 * La planilla de UNA clase: la pantalla que el profesor usa de pie, en el
 * medio de la clase, con una mano.
 *
 * Trae el estado actual de cada alumno porque corregir es el caso normal
 * (DV-001), no la excepción: el profesor marca, se equivoca, y vuelve.
 */
export async function teacherAttendanceSheet(
  organizationId: string,
  teacherId: string,
  classSessionId: string
): Promise<TeacherAttendanceSheetDto | null> {
  const db = getDb();

  const sesiones = await db
    .select({
      id: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      number: schema.classSession.number,
      date: schema.classSession.date,
      topic: schema.classSession.topic,
      canceledAt: schema.classSession.canceledAt,
    })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    )
    .limit(1);
  const sesion = sesiones[0];
  if (!sesion) return null;

  const detalle = await teacherCohortDetail(organizationId, teacherId, sesion.cohortId);
  if (!detalle) return null;

  const marcas = await db
    .select({
      enrollmentId: schema.attendance.enrollmentId,
      status: schema.attendance.status,
      updatedAt: schema.attendance.updatedAt,
      autor: schema.user.name,
    })
    .from(schema.attendance)
    .leftJoin(schema.user, eq(schema.attendance.recordedBy, schema.user.id))
    .where(
      scoped(
        schema.attendance.organizationId,
        organizationId,
        eq(schema.attendance.classSessionId, classSessionId)
      )
    );

  const porInscripcion = new Map(marcas.map((m) => [m.enrollmentId, m]));

  return {
    classSession: {
      id: sesion.id,
      number: sesion.number,
      date: sesion.date.toISOString(),
      topic: sesion.topic,
      canceled: Boolean(sesion.canceledAt),
    },
    cohort: detalle.cohort,
    editable: detalle.editable && !sesion.canceledAt,
    students: detalle.students.map((s) => {
      const m = porInscripcion.get(s.enrollmentId);
      return {
        ...s,
        status: m?.status ?? null,
        recordedByName: m?.autor ?? null,
        recordedAt: m?.updatedAt.toISOString() ?? null,
      };
    }),
  };
}

export type PortalResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: 404 | 422; code: string; message: string };

/**
 * El profesor marca asistencia de SU clase (DV-003), y puede corregir una
 * clase pasada (DV-001) — el sistema no discute con la realidad de un aula.
 *
 * Lo único que NO puede es tocar una cohorte finalizada (DV-005): ahí los
 * porcentajes ya se usaron para decidir quién aprobó.
 */
export async function teacherMarkAttendance(
  organizationId: string,
  teacherId: string,
  userId: string,
  classSessionId: string,
  entries: { enrollmentId: string; status: AttendanceStatus }[]
): Promise<PortalResult<{ marked: number }>> {
  const planilla = await teacherAttendanceSheet(organizationId, teacherId, classSessionId);
  if (!planilla) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }
  if (planilla.cohort.status === "finalizada") {
    return {
      ok: false,
      status: 422,
      code: "cohorte_finalizada",
      message: "La cohorte ya finalizó: la asistencia no se puede cambiar",
    };
  }

  // Solo los alumnos de ESTA cohorte: un `enrollmentId` de otra no entra.
  const propios = new Set(planilla.students.map((s) => s.enrollmentId));
  const validos = entries.filter((e) => propios.has(e.enrollmentId));

  const r = await markAttendance(organizationId, classSessionId, validos, userId);
  if (!r.ok) return { ok: false, status: 422, code: r.code, message: r.message };
  return { ok: true, data: r.data };
}

export type TeacherGradingDto = {
  cohort: TeacherCohortDto;
  editable: boolean;
  assessments: AssessmentDto[];
  students: {
    enrollmentId: string;
    name: string;
    results: Record<string, boolean | null>;
  }[];
};

/**
 * La planilla de evaluación como la ve el profesor: **carga resultados, no
 * crea ni borra evaluaciones** (FR-006/DV-002).
 *
 * Del DTO del staff se cae el certificado y el estado de aprobación derivado:
 * emitir un certificado es de la academia, y "aprobado/reprobado" cruza la
 * asistencia con reglas que el profesor no decide.
 */
export async function teacherCohortGrading(
  organizationId: string,
  teacherId: string,
  cohortId: string
): Promise<TeacherGradingDto | null> {
  const detalle = await teacherCohortDetail(organizationId, teacherId, cohortId);
  if (!detalle) return null;

  const planilla = await cohortGrading(organizationId, cohortId);
  if (!planilla) return null;

  return {
    cohort: detalle.cohort,
    editable: detalle.editable,
    assessments: planilla.assessments,
    students: planilla.students.map((s) => ({
      enrollmentId: s.enrollmentId,
      name: s.contactName,
      results: s.results,
    })),
  };
}

/** Carga o corrige un resultado. La evaluación tiene que ser de SU cohorte. */
export async function teacherRecordResult(
  organizationId: string,
  teacherId: string,
  userId: string,
  assessmentId: string,
  entries: { enrollmentId: string; passed: boolean | null }[]
): Promise<PortalResult<{ recorded: number }>> {
  const filas = await getDb()
    .select({ cohortId: schema.assessment.cohortId })
    .from(schema.assessment)
    .where(
      scoped(
        schema.assessment.organizationId,
        organizationId,
        eq(schema.assessment.id, assessmentId)
      )
    )
    .limit(1);
  const asignada = filas[0];
  if (!asignada) {
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }

  const detalle = await teacherCohortDetail(organizationId, teacherId, asignada.cohortId);
  if (!detalle) {
    // Misma respuesta que si no existiera: no se confirma que exista.
    return { ok: false, status: 404, code: "not_found", message: "Evaluación no encontrada" };
  }
  if (!detalle.editable) {
    return {
      ok: false,
      status: 422,
      code: "cohorte_finalizada",
      message: "La cohorte ya finalizó: los resultados no se pueden cambiar",
    };
  }

  const propios = new Set(detalle.students.map((s) => s.enrollmentId));
  const validos = entries.filter((e) => propios.has(e.enrollmentId));

  const r = await recordResults(organizationId, assessmentId, validos, userId);
  if (!r.ok) return { ok: false, status: 422, code: r.code, message: r.message };
  return { ok: true, data: r.data };
}

export type TeacherContentDto = {
  cohort: TeacherCohortDto;
  announcements: AnnouncementDto[];
  resources: ResourceDto[];
};

/**
 * Material y avisos de la cohorte (FR-007). De solo lectura: el material lo
 * publica la academia, y el profesor lo necesita para saber qué tienen sus
 * alumnos delante.
 */
export async function teacherCohortContent(
  organizationId: string,
  teacherId: string,
  cohortId: string
): Promise<TeacherContentDto | null> {
  const detalle = await teacherCohortDetail(organizationId, teacherId, cohortId);
  if (!detalle) return null;

  const curso = await getDb()
    .select({ courseId: schema.cohort.courseId })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);

  const [announcements, resources] = await Promise.all([
    listAnnouncements(organizationId, cohortId),
    curso[0]
      ? listResources(organizationId, { courseId: curso[0].courseId })
      : Promise.resolve([]),
  ]);

  return { cohort: detalle.cohort, announcements, resources };
}

/**
 * 014 (US5/FR-010) — Las horas dictadas por este profesor.
 *
 * **Sin tarifa: ni la suya ni la de nadie.** `teacher.hourly_rate` existe y es
 * lo que multiplica estas horas, pero eso es una cuenta de la academia. Acá se
 * cuentan clases y horas, que es lo que el profesor necesita para controlar
 * que le liquiden bien.
 */
export type TeacherHoursDto = {
  sessions: number;
  hours: number;
  byCohort: {
    cohortId: string;
    cohortName: string | null;
    sessions: number;
    hours: number;
  }[];
};

export async function teacherOwnHours(
  organizationId: string,
  teacherId: string
): Promise<TeacherHoursDto> {
  const rows = await getDb()
    .select({
      cohortId: schema.classSession.cohortId,
      cohortName: schema.cohort.name,
      hours: schema.classSession.hours,
    })
    .from(schema.classSession)
    .innerJoin(schema.cohort, eq(schema.classSession.cohortId, schema.cohort.id))
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.teacherId, teacherId),
        // Una clase caída no se dictó: contarla sería cobrarla.
        isNull(schema.classSession.canceledAt)
      )
    );

  const porCohorte = new Map<
    string,
    { cohortName: string | null; sessions: number; hours: number }
  >();
  for (const r of rows) {
    const acc = porCohorte.get(r.cohortId) ?? {
      cohortName: r.cohortName,
      sessions: 0,
      hours: 0,
    };
    acc.sessions += 1;
    acc.hours += r.hours ?? 0;
    porCohorte.set(r.cohortId, acc);
  }

  return {
    sessions: rows.length,
    hours: rows.reduce((sum, r) => sum + (r.hours ?? 0), 0),
    byCohort: [...porCohorte.entries()].map(([cohortId, v]) => ({ cohortId, ...v })),
  };
}

/* ============================================================
 * 023 — Lo que el profesor puede CARGAR de su clase
 * ============================================================ */

/**
 * 023 (013/DV-001c, resuelta) — El profesor carga la grabación de SU clase.
 *
 * DV-001c de la 013 preguntaba si esto lo hace el profesor o solo
 * coordinación, y quedó sin resolver. La respuesta llegó de la operación: el
 * que acaba de terminar la clase tiene el enlace de la grabación en el
 * portapapeles, y el que no lo tiene es el que hoy está autorizado a pegarlo.
 * Eso convierte cada grabación en un pedido por WhatsApp.
 *
 * Se resuelve como la asistencia en 014: el profesor puede sobre lo SUYO, y el
 * alcance lo decide `teacherReachesCohort()` — la misma regla, incluida la
 * suplencia. Nada de capacidades de staff.
 *
 * **No toca el enlace de la reunión.** Ese sale del aula virtual (023) y es
 * decisión de coordinación: si el profesor pudiera cambiarlo, el alumno
 * entraría a una sala que la academia no eligió y el detector de choques
 * dejaría de significar algo.
 */
export async function teacherSetRecording(
  organizationId: string,
  teacherId: string,
  classSessionId: string,
  recordingUrl: string | null
): Promise<PortalResult<{ recordingUrl: string | null }>> {
  const db = getDb();

  const filas = await db
    .select({
      id: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
      canceledAt: schema.classSession.canceledAt,
    })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    )
    .limit(1);

  const clase = filas[0];
  // Ausencia = "no la encontré", y la ruta lo traduce a 404. Distinguir
  // "no existe" de "no es tuya" le diría a un profesor ajeno que existe.
  if (!clase) return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  if (!(await teacherReachesCohort(organizationId, teacherId, clase.cohortId))) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }

  /**
   * FR-005e de 013 — Una clase cancelada no ofrece grabación. Dejar cargar una
   * acá crearía una fila que ninguna pantalla va a mostrar: el profesor
   * pegaría el enlace, no pasaría nada visible, y volvería a pegarlo.
   */
  if (clase.canceledAt && recordingUrl) {
    return {
      ok: false,
      status: 422,
      code: "class_canceled",
      message: "La clase está cancelada: no ofrece grabación",
    };
  }

  await db
    .update(schema.classSession)
    .set({ recordingUrl, updatedAt: new Date() })
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    );

  return { ok: true, data: { recordingUrl } };
}

/**
 * 023 — El profesor publica material de SU cohorte.
 *
 * Se cuelga de la CLASE (`class_session_id`) y no del curso: el material del
 * curso es el programa oficial de la academia y lo mantiene coordinación; lo
 * que trae el profesor es el ejercicio del día. Mezclarlos haría que un
 * profesor pudiera reescribir el programa de un curso que dictan otros seis.
 */
export async function teacherAddClassResource(
  organizationId: string,
  teacherId: string,
  classSessionId: string,
  input: { title: string; url: string; kind: ResourceKind }
): Promise<PortalResult<ResourceDto>> {
  const db = getDb();

  const filas = await db
    .select({
      id: schema.classSession.id,
      cohortId: schema.classSession.cohortId,
    })
    .from(schema.classSession)
    .where(
      scoped(
        schema.classSession.organizationId,
        organizationId,
        eq(schema.classSession.id, classSessionId)
      )
    )
    .limit(1);

  const clase = filas[0];
  if (!clase) return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  if (!(await teacherReachesCohort(organizationId, teacherId, clase.cohortId))) {
    return { ok: false, status: 404, code: "not_found", message: "Clase no encontrada" };
  }

  const creado = await createResource(organizationId, {
    classSessionId,
    title: input.title,
    url: input.url,
    kind: input.kind,
  });
  if (!creado.ok) {
    return { ok: false, status: 422, code: creado.code, message: creado.message };
  }

  return { ok: true, data: creado.data };
}

/**
 * 023 — El profesor publica material de SU CAMADA.
 *
 * Es distinto del material de clase: esto lo ven todos sus alumnos durante
 * toda la cursada, no solo quienes miren el día 4. Y es distinto del material
 * del CURSO, que es el programa oficial de la academia y alcanza a las otras
 * camadas que lo dictan — si el profesor pudiera tocar ese, cambiaría el
 * curso de seis colegas.
 *
 * El alcance lo decide `teacherReachesCohort()`: la misma regla de siempre,
 * suplencia incluida. Nada de capacidades de staff.
 */
export async function teacherAddCohortResource(
  organizationId: string,
  teacherId: string,
  cohortId: string,
  input: { title: string; url: string; kind: ResourceKind }
): Promise<PortalResult<ResourceDto>> {
  if (!(await teacherReachesCohort(organizationId, teacherId, cohortId))) {
    // Ausencia = 404: un 403 confirmaría que la camada existe.
    return { ok: false, status: 404, code: "not_found", message: "Camada no encontrada" };
  }

  const creado = await createResource(organizationId, {
    cohortId,
    title: input.title,
    url: input.url,
    kind: input.kind,
  });
  if (!creado.ok) {
    return { ok: false, status: 422, code: creado.code, message: creado.message };
  }

  return { ok: true, data: creado.data };
}
