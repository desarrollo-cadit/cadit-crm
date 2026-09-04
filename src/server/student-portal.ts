import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import type { Currency } from "@/lib/db/schema";
import { buildClassRow, type ClassRowDto } from "@/server/classes";
import { installmentStatus, type InstallmentStatus } from "@/server/billing";
import {
  attendancePercentage,
  resolveMinAttendance,
  type AttendanceStatus,
} from "@/server/attendance";
import { approvalState, type ApprovalState } from "@/server/grading";
import {
  listAnnouncements,
  listResources,
  type AnnouncementDto,
  type ResourceDto,
} from "@/server/resources";
import type { MeetingWindow } from "@/lib/schedule-time";

/**
 * 015 — El ALCANCE del alumno: qué puede ver de sí mismo.
 *
 * Superficie propia (FR-004). No reusa `student-record.ts` aunque calcule
 * casi lo mismo, y la tentación es fuerte porque el legajo ya existe. Casi:
 * el legajo es un documento que el STAFF lee sobre una persona —lleva cédula,
 * teléfono, el vendedor de la inscripción— y su estado de cuenta aparece o no
 * según una capacidad de staff que un alumno jamás va a tener. Reusarlo es
 * exactamente cómo un campo administrativo termina en la pantalla del alumno.
 *
 * Regla del archivo, la misma que la del profesor invertida: **el alumno ve
 * todo lo suyo y nada de nadie más**. Ninguna consulta de este módulo sale sin
 * `contactId` o sin una lista de inscripciones ya verificadas como propias
 * (FR-001, FR-002).
 *
 * **Solo lectura** (FR-003). No hay una sola escritura acá; entregar es 016 y
 * conversar es 017.
 *
 * Ausencia = `null`, nunca un código de estado. Quien elige el 404 es la ruta,
 * por el mismo motivo que en el portal del profesor: un 403 confirmaría que la
 * inscripción existe.
 */

/* ============================================================
 * El alcance
 * ============================================================ */

type OrgClock = {
  timezone: string;
  window: MeetingWindow;
};

async function orgClock(organizationId: string): Promise<OrgClock | null> {
  const rows = await getDb()
    .select({
      timezone: schema.organization.timezone,
      before: schema.organization.meetingOpenBeforeMin,
      after: schema.organization.meetingOpenAfterMin,
    })
    .from(schema.organization)
    .where(eq(schema.organization.id, organizationId))
    .limit(1);
  const org = rows[0];
  if (!org) return null;
  return {
    timezone: org.timezone,
    window: { beforeMin: org.before, afterMin: org.after },
  };
}

type ScopedEnrollment = {
  enrollment: typeof schema.enrollment.$inferSelect;
  cohort: typeof schema.cohort.$inferSelect | null;
  course: typeof schema.course.$inferSelect | null;
  teacherName: string | null;
};

/**
 * Las inscripciones de ESTE contacto. Es la única puerta de entrada del
 * módulo: todo lo demás cruza contra esta lista.
 *
 * Ordenadas por cohorte más reciente primero. Un alumno con cinco cursadas
 * quiere ver la de este mes arriba, no la de 2019.
 */
async function scopedEnrollments(
  organizationId: string,
  contactId: string
): Promise<ScopedEnrollment[]> {
  const rows = await getDb()
    .select({
      enrollment: schema.enrollment,
      cohort: schema.cohort,
      course: schema.course,
      teacherName: schema.teacher.name,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .leftJoin(schema.teacher, eq(schema.cohort.teacherId, schema.teacher.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId)
      )
    )
    .orderBy(desc(schema.cohort.startDate));

  return rows.map((r) => ({
    enrollment: r.enrollment,
    cohort: r.cohort,
    course: r.course,
    teacherName: r.teacherName,
  }));
}

/* ============================================================
 * Mi cursada (US1, US3, US4, US5, US6)
 * ============================================================ */

export type StudentAssessmentDto = {
  name: string;
  required: boolean;
  /**
   * FR-005 — `null` es **pendiente de corrección**, jamás desaprobado. Que la
   * distinción viva en el tipo y no en la pantalla es lo que impide que una
   * pantalla nueva la interprete al revés.
   */
  passed: boolean | null;
};

export type StudentLicenseDto = {
  softwareName: string;
  /** `false` = pedida y todavía sin asignar ("en trámite"), sin fechas. */
  assigned: boolean;
  assignedAt: string | null;
  expiresAt: string | null;
  /** Días para el vencimiento; negativo = ya venció. `null` = sin fecha. */
  daysLeft: number | null;
};

export type StudentCourseDto = {
  enrollmentId: string;
  cohortId: string | null;
  cohortName: string;
  courseName: string;
  status: "planificada" | "en_curso" | "finalizada" | "sin_cohorte";
  startDate: string | null;
  endDate: string | null;
  frequency: string | null;
  classroom: string | null;
  teacherName: string | null;
  /** `null` = todavía no se tomó lista; NO es 0% (DV-003, SC-004). */
  attendancePct: number | null;
  attendedCount: number;
  eligibleCount: number;
  /**
   * 023 — El AVANCE de la cursada: clase N de M.
   *
   * Es distinto de la asistencia y hacía falta. La asistencia responde "¿voy
   * bien?"; esto responde "¿cuánto me falta?", que es lo que una persona
   * quiere saber a mitad de un curso de doce clases. Sin este par, el portal
   * lista datos y no transmite que algo avanza.
   *
   * `totalClasses` cuenta las NO canceladas: una clase que se cayó no alarga
   * la cursada.
   */
  totalClasses: number;
  completedClasses: number;
  minAttendancePct: number | null;
  approval: ApprovalState | "sin_datos";
  approvalReasons: string[];
  assessments: StudentAssessmentDto[];
  certificate: {
    code: string;
    issuedAt: string;
    /** FR-009 — un certificado anulado se ve, pero no se descarga. */
    revokedAt: string | null;
  } | null;
  license: StudentLicenseDto | null;
};

/* ============================================================
 * Mi próxima clase (US2)
 * ============================================================ */

export type StudentNextClassDto = {
  enrollmentId: string;
  cohortId: string;
  cohortName: string;
  courseName: string;
  number: number;
  date: string;
  startsAt: string | null;
  endsAt: string | null;
  startTime: string | null;
  endTime: string | null;
  topic: string | null;
  classroom: string | null;
  teacherName: string | null;
  /** Solo dentro de la ventana horaria de la organización (FR-003 de 013). */
  meetingUrl: string | null;
  /** `true` cuando la clase ya empezó y todavía no terminó. */
  live: boolean;
};

/* ============================================================
 * Mi estado de cuenta (US7)
 * ============================================================ */

export type StudentBalanceDto = {
  currency: Currency;
  total: number;
  paid: number;
  balance: number;
  overdueCount: number;
  /** Vencimiento de la próxima cuota impaga, ISO. `null` = no queda ninguna. */
  nextDueDate: string | null;
};

export type StudentOverviewDto = {
  student: { name: string; email: string | null };
  /**
   * FR-011 — La zona de la ACADEMIA viaja siempre, para que la pantalla pueda
   * decir "18:30 en Montevideo" cuando el alumno la mira desde Asunción. La
   * zona del alumno la pone el navegador; la de la academia no se puede
   * adivinar desde el cliente.
   */
  timezone: string;
  nextClass: StudentNextClassDto | null;
  courses: StudentCourseDto[];
  balances: StudentBalanceDto[];
};

/**
 * 015 (US1-US7) — Todo lo que el alumno pregunta hoy por WhatsApp, junto.
 *
 * Es UNA consulta y no siete pantallas por un motivo de uso: el alumno entra
 * tres minutos, dos veces por semana, casi siempre desde el celular y casi
 * siempre con una sola pregunta. Obligarlo a navegar para encontrarla es
 * devolverle el problema que vino a resolver.
 *
 * Las piezas se traen de una vez y se cruzan en memoria: cinco cursadas no
 * deberían costar treinta consultas.
 */
export async function studentOverview(
  organizationId: string,
  contactId: string,
  now: Date = new Date()
): Promise<StudentOverviewDto | null> {
  const db = getDb();

  const contactRows = await db
    .select({
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
    })
    .from(schema.contact)
    .where(
      scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId))
    )
    .limit(1);
  const contact = contactRows[0];
  if (!contact) return null;

  const clock = await orgClock(organizationId);
  if (!clock) return null;

  const enrollments = await scopedEnrollments(organizationId, contactId);
  const enrollmentIds = enrollments.map((e) => e.enrollment.id);
  const cohortIds = enrollments
    .map((e) => e.cohort?.id)
    .filter((id): id is string => Boolean(id));

  const [sesiones, asistencias, evaluaciones, resultados, certificados, licencias] =
    await Promise.all([
      cohortIds.length
        ? db
            .select()
            .from(schema.classSession)
            .where(
              scoped(
                schema.classSession.organizationId,
                organizationId,
                inArray(schema.classSession.cohortId, cohortIds)
              )
            )
            .orderBy(asc(schema.classSession.date))
        : [],
      enrollmentIds.length
        ? db
            .select()
            .from(schema.attendance)
            .where(
              scoped(
                schema.attendance.organizationId,
                organizationId,
                inArray(schema.attendance.enrollmentId, enrollmentIds)
              )
            )
        : [],
      cohortIds.length
        ? db
            .select()
            .from(schema.assessment)
            .where(
              scoped(
                schema.assessment.organizationId,
                organizationId,
                inArray(schema.assessment.cohortId, cohortIds)
              )
            )
            .orderBy(asc(schema.assessment.createdAt))
        : [],
      enrollmentIds.length
        ? db
            .select()
            .from(schema.assessmentResult)
            .where(
              scoped(
                schema.assessmentResult.organizationId,
                organizationId,
                inArray(schema.assessmentResult.enrollmentId, enrollmentIds)
              )
            )
        : [],
      enrollmentIds.length
        ? db
            .select()
            .from(schema.certificate)
            .where(
              scoped(
                schema.certificate.organizationId,
                organizationId,
                inArray(schema.certificate.enrollmentId, enrollmentIds)
              )
            )
        : [],
      enrollmentIds.length
        ? db
            .select({
              enrollmentId: schema.license.enrollmentId,
              assigned: schema.license.assigned,
              assignedAt: schema.license.assignedAt,
              expiresAt: schema.license.expiresAt,
              softwareName: schema.software.name,
            })
            .from(schema.license)
            .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
            .where(
              scoped(
                schema.license.organizationId,
                organizationId,
                inArray(schema.license.enrollmentId, enrollmentIds)
              )
            )
        : [],
    ]);

  const courses = enrollments.map((e) =>
    buildCourse(e, { sesiones, asistencias, evaluaciones, resultados, certificados, licencias })
  );


  return {
    student: {
      name: fullName({ firstName: contact.firstName, lastName: contact.lastName }),
      email: contact.email,
    },
    timezone: clock.timezone,
    nextClass: pickNextClass(enrollments, sesiones, clock, now),
    courses,
    balances: await studentBalances(organizationId, enrollmentIds, now),
  };
}

type CrossData = {
  sesiones: (typeof schema.classSession.$inferSelect)[];
  asistencias: (typeof schema.attendance.$inferSelect)[];
  evaluaciones: (typeof schema.assessment.$inferSelect)[];
  resultados: (typeof schema.assessmentResult.$inferSelect)[];
  certificados: (typeof schema.certificate.$inferSelect)[];
  licencias: {
    enrollmentId: string;
    assigned: boolean;
    assignedAt: Date | null;
    expiresAt: Date | null;
    softwareName: string;
  }[];
};

const DIA_MS = 86_400_000;

function buildCourse(
  { enrollment, cohort, course, teacherName }: ScopedEnrollment,
  data: CrossData,
  now: Date = new Date()
): StudentCourseDto {
  const clases = data.sesiones.filter((s) => s.cohortId === cohort?.id);
  const misMarcas = data.asistencias.filter((a) => a.enrollmentId === enrollment.id);

  const elegibles = clases.filter(
    (c) => !c.canceledAt && (!enrollment.enrolledAt || c.date >= enrollment.enrolledAt)
  );

  /**
   * 015 — **Solo las clases que YA PASARON.**
   *
   * `attendancePercentage` (009) mete en el denominador todas las clases
   * elegibles, incluidas las que todavía no ocurrieron. Para decidir la
   * aprobación al FINAL del curso da igual —ahí ya pasaron todas—, pero acá
   * dice "cómo voy", y en la segunda semana de un curso de doce el alumno leía
   * **8% de asistencia** y un cartel de "estás en riesgo" habiendo ido a todas.
   *
   * Se encontró recorriendo la cohorte de demostración: el panel decía "0 de 5
   * clases" mientras la lista de abajo mostraba "Viniste, Viniste, Faltaste".
   * Dos números del mismo dato que no coincidían.
   *
   * El criterio de APROBACIÓN no se toca (`attendancePercentage` sigue siendo
   * la cuenta oficial de 009/010): esto es lo que se MUESTRA mientras la
   * cursada está en marcha.
   */
  const dictadas = elegibles.filter((c) => c.date.getTime() <= now.getTime());
  const presentes = dictadas.filter((c) => {
    const marca = misMarcas.find((a) => a.classSessionId === c.id)?.status;
    return marca === "presente" || marca === "tarde";
  }).length;

  /**
   * 015 (SC-004, DV-003) — **0% porque nadie pasó lista NO es 0% porque no
   * vino.** Misma corrección que el legajo (013/T034), y acá pesa más: el
   * legajo lo lee coordinación, que sabe qué cargó; esto lo lee el alumno, que
   * no tiene forma de distinguir un dato de un descuido. La mayoría de las 41
   * cohortes importadas está exactamente en ese estado.
   */
  const attendancePct =
    misMarcas.length === 0 || dictadas.length === 0
      ? null
      : attendancePercentage(
          dictadas.map((c) => ({
            sessionDate: c.date,
            canceled: Boolean(c.canceledAt),
            status:
              (misMarcas.find((a) => a.classSessionId === c.id)?.status as
                | AttendanceStatus
                | undefined) ?? null,
          })),
          enrollment.enrolledAt
        );

  const minAttendancePct = resolveMinAttendance(
    cohort?.minAttendancePct ?? null,
    course?.minAttendancePct ?? null
  );

  const evalsDeLaCohorte = data.evaluaciones.filter((a) => a.cohortId === cohort?.id);
  const assessments: StudentAssessmentDto[] = evalsDeLaCohorte.map((a) => {
    const mio = data.resultados.find(
      (r) => r.assessmentId === a.id && r.enrollmentId === enrollment.id
    );
    return {
      name: a.name,
      required: a.required,
      passed: mio?.passed ?? null,
    };
  });

  const { state, reasons } = approvalState(
    assessments.filter((a) => a.required).map((a) => a.passed),
    attendancePct,
    minAttendancePct
  );

  const sinDatos = assessments.length === 0 && attendancePct === null;

  const cert = data.certificados.find((c) => c.enrollmentId === enrollment.id);
  const lic = data.licencias.find((l) => l.enrollmentId === enrollment.id);

  return {
    enrollmentId: enrollment.id,
    cohortId: cohort?.id ?? null,
    cohortName: cohort?.name ?? course?.name ?? "Inscripción sin cohorte",
    courseName: course?.name ?? "—",
    status: cohort?.status ?? "sin_cohorte",
    startDate: cohort?.startDate?.toISOString() ?? null,
    endDate: cohort?.endDate?.toISOString() ?? null,
    frequency: cohort?.frequency ?? null,
    classroom: cohort?.classroom ?? null,
    teacherName,
    attendancePct,
    attendedCount: presentes,
    // Las que ya pasaron: es el denominador que el alumno puede reconocer
    // mirando su propia lista de clases.
    eligibleCount: dictadas.length,
    /**
     * El avance mira TODA la camada, no solo desde que se inscribió: alguien
     * que entró en la cuarta semana igual quiere saber en qué clase va el
     * curso. Es la diferencia con el denominador de la asistencia, que sí
     * arranca en su inscripción.
     */
    totalClasses: clases.filter((c) => !c.canceledAt).length,
    completedClasses: clases.filter(
      (c) => !c.canceledAt && c.date.getTime() <= now.getTime()
    ).length,
    minAttendancePct,
    approval: sinDatos ? "sin_datos" : state,
    approvalReasons: sinDatos
      ? ["Esta cursada no tiene asistencia ni evaluaciones registradas en el sistema"]
      : reasons,
    assessments,
    certificate: cert
      ? {
          code: cert.code,
          issuedAt: cert.issuedAt.toISOString(),
          revokedAt: cert.revokedAt?.toISOString() ?? null,
        }
      : null,
    /**
     * FR-010 — Sin fila de licencia no se inventa una "en trámite": puede ser
     * un curso que no la necesita, o un alumno con licencia propia. Con fila y
     * `assigned: false` sí: alguien la pidió y todavía no llegó.
     */
    license: lic
      ? {
          softwareName: lic.softwareName,
          assigned: lic.assigned,
          assignedAt: lic.assignedAt?.toISOString() ?? null,
          expiresAt: lic.expiresAt?.toISOString() ?? null,
          daysLeft: lic.expiresAt
            ? Math.ceil((lic.expiresAt.getTime() - now.getTime()) / DIA_MS)
            : null,
        }
      : null,
  };
}

/**
 * 015 (US2, SC-001) — La próxima clase: la pregunta más frecuente, arriba.
 *
 * Se busca entre TODAS las cursadas abiertas y no dentro de una: el alumno que
 * cursa Revit y Civil 3D pregunta "¿cuándo tengo clase?", no "¿cuándo tengo
 * clase de Revit?".
 *
 * Una clase que ya empezó y todavía no terminó gana sobre la de mañana: a las
 * 18:40 de un martes, lo que hace falta es el enlace de la que está pasando.
 */
function pickNextClass(
  enrollments: ScopedEnrollment[],
  sesiones: (typeof schema.classSession.$inferSelect)[],
  clock: OrgClock,
  now: Date
): StudentNextClassDto | null {
  const porCohorte = new Map<string, ScopedEnrollment>();
  for (const e of enrollments) {
    // Una cursada finalizada no tiene "próxima clase". Si quedó una fila
    // futura en una cohorte cerrada, es un dato viejo, no una clase.
    if (e.cohort && e.cohort.status !== "finalizada") porCohorte.set(e.cohort.id, e);
  }
  if (porCohorte.size === 0) return null;

  const candidatas = sesiones
    .filter((s) => porCohorte.has(s.cohortId) && !s.canceledAt)
    .map((s) => {
      const e = porCohorte.get(s.cohortId)!;
      const row = buildClassRow({
        id: s.id,
        number: s.number,
        projected: false,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        topic: s.topic,
        canceledAt: s.canceledAt,
        cancelReason: s.cancelReason,
        meetingUrl: s.meetingUrl,

        cohortMeetingUrl: e.cohort?.meetingUrl ?? null,
        recordingUrl: s.recordingUrl,
        timezone: clock.timezone,
        window: clock.window,
        now,
      });
      return { s, e, row };
    })
    /**
     * El corte es por el FIN de la clase, no por el inicio: mientras la clase
     * está pasando sigue siendo la próxima, que es cuando más se necesita el
     * enlace. Sin hora cargada se cae al día —6 de las 41 cohortes no tienen
     * horario— y ahí el día entero cuenta como vigente.
     */
    .filter(({ row, s }) => {
      const fin = row.endsAt ?? row.startsAt;
      if (fin) return new Date(fin).getTime() >= now.getTime();
      return s.date.getTime() + DIA_MS >= now.getTime();
    })
    .sort((a, b) => {
      const ta = a.row.startsAt ? new Date(a.row.startsAt).getTime() : a.s.date.getTime();
      const tb = b.row.startsAt ? new Date(b.row.startsAt).getTime() : b.s.date.getTime();
      return ta - tb;
    });

  const elegida = candidatas[0];
  if (!elegida) return null;

  const { s, e, row } = elegida;
  const empezo = row.startsAt ? new Date(row.startsAt).getTime() <= now.getTime() : false;

  return {
    enrollmentId: e.enrollment.id,
    cohortId: s.cohortId,
    cohortName: e.cohort?.name ?? e.course?.name ?? "Mi cursada",
    courseName: e.course?.name ?? "—",
    number: s.number,
    date: s.date.toISOString(),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    startTime: s.startTime,
    endTime: s.endTime,
    topic: s.topic,
    classroom: e.cohort?.classroom ?? null,
    teacherName: e.teacherName,
    meetingUrl: row.meetingUrl,
    live: empezo,
  };
}

/* ============================================================
 * El detalle de una cursada
 * ============================================================ */

export type StudentClassDto = ClassRowDto & {
  /** Mi marca en esta clase. `null` = todavía no se tomó lista. */
  attendance: AttendanceStatus | null;
};

export type StudentCourseDetailDto = {
  course: StudentCourseDto;
  timezone: string;
  classes: StudentClassDto[];
  announcements: AnnouncementDto[];
  resources: ResourceDto[];
  /** 024 — Dónde estoy, qué logré, qué falta. Ver `buildMilestones`. */
  milestones: StudentMilestone[];
};

/**
 * Una cursada del alumno, en detalle.
 *
 * Devuelve `null` tanto si la inscripción no existe como si es de otra
 * persona (FR-001, SC-002). Las dos salen iguales: distinguirlas le diría a
 * quien prueba ids ajenos cuáles existen.
 */
export async function studentCourseDetail(
  organizationId: string,
  contactId: string,
  enrollmentId: string,
  now: Date = new Date()
): Promise<StudentCourseDetailDto | null> {
  const db = getDb();

  const clock = await orgClock(organizationId);
  if (!clock) return null;

  const enrollments = await scopedEnrollments(organizationId, contactId);
  const mia = enrollments.find((e) => e.enrollment.id === enrollmentId);
  if (!mia) return null;

  const cohortId = mia.cohort?.id ?? null;

  const [sesiones, asistencias, evaluaciones, resultados, certificados, licencias] =
    await Promise.all([
      cohortId
        ? db
            .select()
            .from(schema.classSession)
            .where(
              scoped(
                schema.classSession.organizationId,
                organizationId,
                eq(schema.classSession.cohortId, cohortId)
              )
            )
            .orderBy(asc(schema.classSession.number))
        : [],
      db
        .select()
        .from(schema.attendance)
        .where(
          scoped(
            schema.attendance.organizationId,
            organizationId,
            eq(schema.attendance.enrollmentId, enrollmentId)
          )
        ),
      cohortId
        ? db
            .select()
            .from(schema.assessment)
            .where(
              scoped(
                schema.assessment.organizationId,
                organizationId,
                eq(schema.assessment.cohortId, cohortId)
              )
            )
            .orderBy(asc(schema.assessment.createdAt))
        : [],
      db
        .select()
        .from(schema.assessmentResult)
        .where(
          scoped(
            schema.assessmentResult.organizationId,
            organizationId,
            eq(schema.assessmentResult.enrollmentId, enrollmentId)
          )
        ),
      db
        .select()
        .from(schema.certificate)
        .where(
          scoped(
            schema.certificate.organizationId,
            organizationId,
            eq(schema.certificate.enrollmentId, enrollmentId)
          )
        ),
      db
        .select({
          enrollmentId: schema.license.enrollmentId,
          assigned: schema.license.assigned,
          assignedAt: schema.license.assignedAt,
          expiresAt: schema.license.expiresAt,
          softwareName: schema.software.name,
        })
        .from(schema.license)
        .innerJoin(schema.software, eq(schema.license.softwareId, schema.software.id))
        .where(
          scoped(
            schema.license.organizationId,
            organizationId,
            eq(schema.license.enrollmentId, enrollmentId)
          )
        ),
    ]);

  const course = buildCourse(
    mia,
    { sesiones, asistencias, evaluaciones, resultados, certificados, licencias },
    now
  );


  const classes: StudentClassDto[] = sesiones.map((s) => ({
    ...buildClassRow({
      id: s.id,
      number: s.number,
      projected: false,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      topic: s.topic,
      canceledAt: s.canceledAt,
      cancelReason: s.cancelReason,
      meetingUrl: s.meetingUrl,

      cohortMeetingUrl: mia.cohort?.meetingUrl ?? null,
      recordingUrl: s.recordingUrl,
      timezone: clock.timezone,
      window: clock.window,
      now,
    }),
    attendance:
      (asistencias.find((a) => a.classSessionId === s.id)?.status as
        | AttendanceStatus
        | undefined) ?? null,
  }));

  /**
   * El material y los avisos son de la COHORTE y del CURSO: los mismos que ve
   * el profesor en su portal. No hay nada de compañeros acá — ni nombres, ni
   * notas, ni asistencia ajena (FR-002).
   */
  const [announcements, resources] = await Promise.all([
    cohortId ? listAnnouncements(organizationId, cohortId) : Promise.resolve([]),
    mia.course?.id
      ? listResources(organizationId, { courseId: mia.course.id })
      : Promise.resolve([]),
  ]);

  /**
   * 024 — El recorrido. Se arma acá, en el servidor, y no en la pantalla: es
   * lo que el alumno lee sobre sí mismo, y la regla de qué se puede afirmar
   * no puede quedar a criterio de quien escriba el próximo componente.
   */
  const milestones = buildMilestones({
    enrolledAt: mia.enrollment.enrolledAt,
    classes: sesiones
      .filter((s) => !s.canceledAt)
      .map((s) => ({ date: s.date, number: s.number })),
    attendancePct: course.attendancePct,
    minAttendancePct: course.minAttendancePct,
    assessments: evaluaciones.map((a) => {
      const mio = resultados.find((r) => r.assessmentId === a.id);
      return {
        name: a.name,
        required: a.required,
        passed: mio?.passed ?? null,
        // La fecha del hito es la de la CORRECCIÓN, no la de la evaluación:
        // el logro es que se aprobó, y eso pasó cuando alguien la corrigió.
        at: mio?.updatedAt ?? null,
      };
    }),
    certificate: certificados[0]
      ? { issuedAt: certificados[0].issuedAt, revokedAt: certificados[0].revokedAt }
      : null,
    now,
  });

  return {
    course,
    timezone: clock.timezone,
    classes,
    announcements,
    resources,
    milestones,
  };
}

/* ============================================================
 * Mi estado de cuenta (US7, FR-006)
 * ============================================================ */

export type StudentInstallmentDto = {
  number: number;
  dueDate: string;
  amount: number;
  currency: Currency;
  paid: number;
  balance: number;
  status: InstallmentStatus;
};

export type StudentAccountEntryDto = {
  enrollmentId: string;
  cohortName: string;
  courseName: string;
  currency: Currency;
  /** `true` si la inscripción la factura una empresa (DV-005). */
  billedToCompany: boolean;
  companyName: string | null;
  installments: StudentInstallmentDto[];
  payments: {
    amount: number;
    currency: Currency;
    paidAt: string;
    method: "efectivo" | "transferencia" | "tarjeta" | "otro";
    receiptNumber: string | null;
  }[];
};

export type StudentAccountDto = {
  balances: StudentBalanceDto[];
  entries: StudentAccountEntryDto[];
};

/**
 * 015 (US7, FR-006) — Cuotas, pagos y saldo, en la moneda de cada inscripción.
 *
 * **Nunca se suman monedas distintas** (corrección del ciclo 007): un alumno
 * de Paraguay que pagó parte en guaraníes y parte en dólares ve dos totales,
 * no uno inventado.
 *
 * DV-002 — La deuda vencida se muestra. Ocultarla no la hace desaparecer:
 * genera la llamada que este portal vino a evitar.
 */
export async function studentAccount(
  organizationId: string,
  contactId: string,
  now: Date = new Date()
): Promise<StudentAccountDto | null> {
  const db = getDb();

  const enrollments = await scopedEnrollments(organizationId, contactId);
  const enrollmentIds = enrollments.map((e) => e.enrollment.id);
  if (enrollmentIds.length === 0) return { balances: [], entries: [] };

  const cuotas = await db
    .select()
    .from(schema.installment)
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        inArray(schema.installment.enrollmentId, enrollmentIds)
      )
    )
    .orderBy(asc(schema.installment.number));

  const vigentes = cuotas.filter((c) => !c.canceledAt);

  const pagos = await db
    .select()
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        inArray(schema.payment.enrollmentId, enrollmentIds)
      )
    )
    .orderBy(desc(schema.payment.paidAt));
  const validos = pagos.filter((p) => !p.voidedAt);

  const companyIds = enrollments
    .map((e) => e.enrollment.companyId)
    .filter((id): id is string => Boolean(id));
  const empresas = companyIds.length
    ? await db
        .select({ id: schema.company.id, legalName: schema.company.legalName })
        .from(schema.company)
        .where(
          scoped(
            schema.company.organizationId,
            organizationId,
            inArray(schema.company.id, companyIds)
          )
        )
    : [];

  const pagadoDe = (installmentId: string) =>
    validos
      .filter((p) => p.installmentId === installmentId)
      .reduce((sum, p) => sum + p.amount, 0);

  const entries: StudentAccountEntryDto[] = enrollments
    .map((e): StudentAccountEntryDto | null => {
      const misCuotas = vigentes.filter((c) => c.enrollmentId === e.enrollment.id);
      const misPagos = validos.filter((p) => p.enrollmentId === e.enrollment.id);
      if (misCuotas.length === 0 && misPagos.length === 0) return null;

      const empresa = empresas.find((c) => c.id === e.enrollment.companyId);

      return {
        enrollmentId: e.enrollment.id,
        cohortName: e.cohort?.name ?? e.course?.name ?? "Inscripción sin cohorte",
        courseName: e.course?.name ?? "—",
        currency: e.enrollment.currency,
        billedToCompany: Boolean(e.enrollment.companyId),
        companyName: empresa?.legalName ?? null,
        installments: misCuotas.map((c) => {
          const paid = pagadoDe(c.id);
          return {
            number: c.number,
            dueDate: c.dueDate.toISOString(),
            amount: c.amount,
            currency: c.currency,
            paid,
            balance: Math.max(0, c.amount - paid),
            status: installmentStatus(c.amount, paid, c.dueDate, now),
          };
        }),
        payments: misPagos.map((p) => ({
          amount: p.amount,
          currency: p.currency,
          paidAt: p.paidAt.toISOString(),
          method: p.method,
          receiptNumber: p.receiptNumber,
        })),
      };
    })
    .filter((e): e is StudentAccountEntryDto => e !== null);

  return {
    balances: await studentBalances(organizationId, enrollmentIds, now),
    entries,
  };
}

/** Saldo por moneda. Nunca se suman monedas distintas. */
async function studentBalances(
  organizationId: string,
  enrollmentIds: string[],
  now: Date
): Promise<StudentBalanceDto[]> {
  if (enrollmentIds.length === 0) return [];
  const db = getDb();

  const cuotas = await db
    .select()
    .from(schema.installment)
    .where(
      scoped(
        schema.installment.organizationId,
        organizationId,
        inArray(schema.installment.enrollmentId, enrollmentIds)
      )
    );
  const vigentes = cuotas.filter((c) => !c.canceledAt);
  if (vigentes.length === 0) return [];

  const pagos = await db
    .select()
    .from(schema.payment)
    .where(
      scoped(
        schema.payment.organizationId,
        organizationId,
        inArray(
          schema.payment.installmentId,
          vigentes.map((c) => c.id)
        )
      )
    );

  const porMoneda = new Map<Currency, StudentBalanceDto>();

  for (const cuota of vigentes) {
    const acc =
      porMoneda.get(cuota.currency) ??
      ({
        currency: cuota.currency,
        total: 0,
        paid: 0,
        balance: 0,
        overdueCount: 0,
        nextDueDate: null,
      } satisfies StudentBalanceDto);

    const pagado = pagos
      .filter((p) => p.installmentId === cuota.id && !p.voidedAt)
      .reduce((sum, p) => sum + p.amount, 0);

    acc.total += cuota.amount;
    acc.paid += pagado;
    acc.balance += cuota.amount - pagado;

    const impaga = pagado < cuota.amount;
    if (impaga && cuota.dueDate < now) acc.overdueCount += 1;
    if (impaga && cuota.dueDate >= now) {
      const actual = acc.nextDueDate ? new Date(acc.nextDueDate) : null;
      if (!actual || cuota.dueDate < actual) acc.nextDueDate = cuota.dueDate.toISOString();
    }

    porMoneda.set(cuota.currency, acc);
  }

  return [...porMoneda.values()];
}

/* ============================================================
 * Mi certificado (US6, FR-009)
 * ============================================================ */

export type StudentCertificateDto = {
  code: string;
  issuedAt: string;
  revokedAt: string | null;
  courseName: string;
  cohortName: string;
};

/**
 * Los certificados del alumno, emitidos y anulados.
 *
 * **El anulado se muestra y no se esconde** (FR-009): quien lo tuvo y lo
 * perdió necesita saber que pasó, y por qué preguntar. Lo que no puede es
 * descargarse ni verificarse como válido — de eso se encarga la verificación
 * pública, que ya distingue los dos casos.
 */
export async function studentCertificates(
  organizationId: string,
  contactId: string
): Promise<StudentCertificateDto[]> {
  const db = getDb();

  const rows = await db
    .select({
      code: schema.certificate.code,
      issuedAt: schema.certificate.issuedAt,
      revokedAt: schema.certificate.revokedAt,
      courseName: schema.course.name,
      cohortName: schema.cohort.name,
    })
    .from(schema.certificate)
    .innerJoin(
      schema.enrollment,
      eq(schema.certificate.enrollmentId, schema.enrollment.id)
    )
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.certificate.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId)
      )
    )
    .orderBy(desc(schema.certificate.issuedAt));

  return rows.map((r) => ({
    code: r.code,
    issuedAt: r.issuedAt.toISOString(),
    revokedAt: r.revokedAt?.toISOString() ?? null,
    courseName: r.courseName ?? "—",
    cohortName: r.cohortName ?? r.courseName ?? "—",
  }));
}

/**
 * 015 — Las cursadas del alumno para el menú lateral, sin traer el resto.
 *
 * Existe aparte de `studentOverview` porque el caparazón se dibuja en el
 * SERVIDOR, en cada navegación: pedirle ahí las cuotas, las evaluaciones y la
 * asistencia de cinco cursadas para escribir cinco nombres en un menú sería
 * pagar el panel entero por un enlace.
 */
export type StudentNavCourseDto = {
  enrollmentId: string;
  label: string;
  active: boolean;
};

export async function studentNavCourses(
  organizationId: string,
  contactId: string
): Promise<StudentNavCourseDto[]> {
  const rows = await getDb()
    .select({
      enrollmentId: schema.enrollment.id,
      cohortName: schema.cohort.name,
      courseName: schema.course.name,
      status: schema.cohort.status,
      startDate: schema.cohort.startDate,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        and(
          eq(schema.enrollment.contactId, contactId),
          // Una inscripción sin cohorte es un lead del pipeline, no una
          // cursada: en el menú del alumno sería una fila sin destino.
          gte(schema.cohort.startDate, new Date(0))
        )
      )
    )
    .orderBy(desc(schema.cohort.startDate));

  return rows.map((r) => ({
    enrollmentId: r.enrollmentId,
    label: r.courseName ?? r.cohortName ?? "Mi cursada",
    active: r.status !== "finalizada",
  }));
}

/* ============================================================
 * 024 — El recorrido de la cursada
 * ============================================================ */

export type MilestoneState =
  /** Pasó, y el sistema tiene con qué probarlo. */
  | "cumplido"
  /** Está pasando ahora. */
  | "en_curso"
  /** Todavía no pasó. */
  | "pendiente"
  /** Pasó el momento y NO se alcanzó. Solo cuando hay datos para afirmarlo. */
  | "no_alcanzado"
  /** El sistema no puede decir nada: no hay dato cargado. */
  | "sin_datos";

export type StudentMilestone = {
  key: string;
  label: string;
  detail: string | null;
  state: MilestoneState;
  /** Fecha del hecho si ya pasó, o la esperada si falta. `null` = no aplica. */
  at: string | null;
};

/**
 * 024 — Los hitos de una cursada: dónde estoy, qué logré, qué falta.
 *
 * **Pura**, y con una regla que la gobierna entera: *un hito solo se marca
 * cumplido si el sistema tiene con qué probarlo*.
 *
 * Es la misma regla que hizo existir `sin_datos` en el legajo (013/T030) y
 * `pendiente` en las evaluaciones (010/FR-005), y acá pesa más que en ningún
 * lado: esto es lo que la persona lee sobre su propio recorrido. Una medalla
 * regalada no motiva a nadie —se nota—, y una que dice "no alcanzado" cuando
 * en realidad nadie cargó el dato es una acusación.
 *
 * Por eso NO hay puntos, ni niveles, ni rachas: nada que el sistema tenga que
 * inventar. Cada hito es un hecho con fecha, o un hecho que todavía no pasó.
 */
export function buildMilestones(input: {
  enrolledAt: Date | null;
  /** Clases NO canceladas, ordenadas por fecha. */
  classes: { date: Date; number: number }[];
  attendancePct: number | null;
  minAttendancePct: number | null;
  assessments: { name: string; required: boolean; passed: boolean | null; at: Date | null }[];
  certificate: { issuedAt: Date; revokedAt: Date | null } | null;
  now: Date;
}): StudentMilestone[] {
  const hitos: StudentMilestone[] = [];
  const ahora = input.now.getTime();
  const paso = (d: Date | null) => d !== null && d.getTime() <= ahora;

  /* -- Arranque -------------------------------------------- */
  if (input.enrolledAt) {
    hitos.push({
      key: "inscripcion",
      label: "Te inscribiste",
      detail: null,
      state: "cumplido",
      at: input.enrolledAt.toISOString(),
      });
  }

  const clases = [...input.classes].sort((a, b) => a.date.getTime() - b.date.getTime());
  const primera = clases[0];
  const ultima = clases[clases.length - 1];

  if (primera) {
    hitos.push({
      key: "primera-clase",
      label: "Primera clase",
      detail: null,
      state: paso(primera.date) ? "cumplido" : "pendiente",
      at: primera.date.toISOString(),
    });
  }

  /* -- La mitad: el punto donde una cursada se siente larga -- */
  if (clases.length >= 4) {
    const mitad = clases[Math.ceil(clases.length / 2) - 1]!;
    hitos.push({
      key: "mitad",
      label: "Mitad de la cursada",
      detail: `Clase ${mitad.number} de ${clases.length}`,
      state: paso(mitad.date) ? "cumplido" : "pendiente",
      at: mitad.date.toISOString(),
    });
  }

  /* -- Cada evaluación, con su nombre real ------------------ */
  for (const [i, evaluacion] of input.assessments.entries()) {
    hitos.push({
      key: `evaluacion-${i}`,
      label: evaluacion.name,
      detail: evaluacion.required ? null : "No obligatoria",
      /**
       * FR-005 de 010 — sin corregir es PENDIENTE, jamás desaprobada. Es la
       * regla que más veces se rompe sola cuando alguien escribe
       * `passed ? ... : ...` sin mirar el `null`.
       */
      state:
        evaluacion.passed === true
          ? "cumplido"
          : evaluacion.passed === false
            ? "no_alcanzado"
            : "pendiente",
      at: evaluacion.at?.toISOString() ?? null,
    });
  }

  /* -- Asistencia: un estado, no una fecha ------------------ */
  if (input.minAttendancePct !== null) {
    hitos.push({
      key: "asistencia",
      label: `Asistencia mínima (${input.minAttendancePct}%)`,
      detail:
        input.attendancePct === null
          ? "Todavía no se registró asistencia"
          : `Vas ${input.attendancePct}%`,
      /**
       * `sin_datos` y no "no alcanzado": **0% porque nadie pasó lista no es 0%
       * porque no vino**. Es la corrección de 013/T034, y acá es la diferencia
       * entre informar y acusar.
       */
      state:
        input.attendancePct === null
          ? "sin_datos"
          : input.attendancePct >= input.minAttendancePct
            ? "cumplido"
            : "no_alcanzado",
      at: null,
    });
  }

  if (ultima && clases.length > 1) {
    hitos.push({
      key: "ultima-clase",
      label: "Última clase",
      detail: null,
      state: paso(ultima.date) ? "cumplido" : "pendiente",
      at: ultima.date.toISOString(),
    });
  }

  /* -- El final ---------------------------------------------- */
  hitos.push({
    key: "certificado",
    label: "Certificado",
    detail: input.certificate?.revokedAt
      ? "Anulado — consultá con la academia"
      : input.certificate
        ? null
        : "Se emite al terminar, con la asistencia y las evaluaciones cumplidas",
    state: input.certificate
      ? input.certificate.revokedAt
        ? "no_alcanzado"
        : "cumplido"
      : "pendiente",
    at: input.certificate?.issuedAt.toISOString() ?? null,
  });

  /**
   * El PRIMER hito pendiente con fecha es "donde estoy parado". Se marca acá y
   * no en la pantalla para que las tres audiencias que algún día lo miren vean
   * lo mismo — y porque "el siguiente" es una regla, no una decisión visual.
   */
  const siguiente = hitos.find((h) => h.state === "pendiente" && h.at !== null);
  if (siguiente) siguiente.state = "en_curso";

  return hitos;
}
