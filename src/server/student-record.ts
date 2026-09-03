import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import type { Capability } from "@/lib/capabilities";
import type { Currency } from "@/lib/db/schema";
import {
  attendancePercentage,
  resolveMinAttendance,
} from "@/server/attendance";
import { approvalState, type ApprovalState } from "@/server/grading";

/**
 * 013 (T026, US6/FR-009) — El legajo: todo el recorrido de una persona en una
 * sola pantalla.
 *
 * Es la pantalla que resume el cambio de CRM a academia. Un CRM muestra el
 * estado de una venta; una academia muestra el recorrido de una persona: qué
 * cursó, cuánto asistió, qué aprobó, qué certificados tiene y cómo está su
 * cuenta.
 *
 * **Por CONTACTO, no por inscripción** (DV-004). Una persona puede haber
 * cursado tres veces, y la pregunta que hace el coordinador es "contame de
 * Ana", no "contame de la inscripción 47". Es coherente con 012, donde el
 * acceso al portal se otorga al contacto justamente por lo mismo.
 */

export type RecordCourse = {
  enrollmentId: string;
  cohortId: string | null;
  cohortName: string;
  courseName: string;
  startDate: string | null;
  endDate: string | null;
  enrolledAt: string | null;
  /** `null` = la cohorte no tiene clases registradas todavía. */
  attendancePct: number | null;
  minAttendancePct: number | null;
  /**
   * 013 (T030) — `"sin_datos"` NO viene de `approvalState`: se decide acá.
   *
   * `approvalState([], null, null)` devuelve **"aprobado"**, y para la
   * planilla de la cohorte (010) está bien: ahí el coordinador sabe que
   * todavía no cargó nada. En el LEGAJO no: es un documento sobre una persona,
   * y decir "Aprobado" sin una sola evaluación ni una asistencia registrada es
   * afirmar algo que el sistema no puede respaldar.
   *
   * Encontrado con datos reales: un alumno con 5 cursadas figuraba aprobado en
   * las cinco, sin un solo dato cargado.
   */
  approval: ApprovalState | "sin_datos";
  approvalReasons: string[];
  assessments: { name: string; passed: boolean | null }[];
  certificate: { code: string; issuedAt: string; revokedAt: string | null } | null;
};

export type RecordAccount = {
  currency: Currency;
  total: number;
  paid: number;
  balance: number;
  overdueCount: number;
};

export type StudentRecordDto = {
  contact: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    nationalId: string | null;
  };
  courses: RecordCourse[];
  /**
   * 013 (T027, FR-010) — Estado de cuenta.
   *
   * **`undefined` cuando la sesión no tiene `cobranza.ver`.** No se arma en el
   * objeto: no es un filtro de UI. Mismo criterio que `buildRosterEntry` — un
   * dato que no se debe ver no viaja, aunque nadie lo dibuje.
   */
  account?: RecordAccount[];
};

export async function getStudentRecord(
  organizationId: string,
  contactId: string,
  capabilities: readonly Capability[]
): Promise<StudentRecordDto | null> {
  const db = getDb();

  const contactRows = await db
    .select()
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  const contact = contactRows[0];
  if (!contact) return null;

  const enrollments = await db
    .select({
      enrollment: schema.enrollment,
      cohort: schema.cohort,
      course: schema.course,
    })
    .from(schema.enrollment)
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId)
      )
    )
    .orderBy(asc(schema.enrollment.createdAt));

  const enrollmentIds = enrollments.map((e) => e.enrollment.id);
  const cohortIds = enrollments
    .map((e) => e.cohort?.id)
    .filter((id): id is string => Boolean(id));

  // Se traen todas las piezas de una vez y se cruzan en memoria: una persona
  // con tres cursadas no debería costar quince consultas.
  const [asistencias, clases, resultados, evaluaciones, certificados] =
    await Promise.all([
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
            .from(schema.classSession)
            .where(
              scoped(
                schema.classSession.organizationId,
                organizationId,
                inArray(schema.classSession.cohortId, cohortIds)
              )
            )
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
    ]);

  const courses: RecordCourse[] = enrollments.map(({ enrollment, cohort, course }) => {
    const clasesDeLaCohorte = clases.filter((c) => c.cohortId === cohort?.id);
    const asistenciaDeEsta = asistencias.filter((a) => a.enrollmentId === enrollment.id);

    /**
     * 013 (T034) — **0% porque nadie pasó lista NO es 0% porque no vino.**
     *
     * `attendancePercentage` devuelve 0 cuando hay clases y ninguna marca de
     * presencia, y para la planilla de asistencia está bien. En el legajo es
     * una acusación: dice que la persona no fue a ninguna clase, cuando lo que
     * pasó es que el profesor todavía no tomó lista.
     *
     * Lo encontró el arnés E2E, no el test unitario: hacía falta una cohorte
     * CON cronograma generado y SIN asistencia cargada, que es exactamente el
     * estado de las 41 cohortes reales el día que se genere el cronograma.
     */
    const pct =
      asistenciaDeEsta.length === 0
        ? null
        : attendancePercentage(
            clasesDeLaCohorte.map((c) => ({
              sessionDate: c.date,
              canceled: Boolean(c.canceledAt),
              status:
                asistenciaDeEsta.find((a) => a.classSessionId === c.id)?.status ?? null,
            })),
            enrollment.enrolledAt
          );

    const minPct = resolveMinAttendance(
      cohort?.minAttendancePct ?? null,
      course?.minAttendancePct ?? null
    );

    const evalsDeLaCohorte = evaluaciones.filter((a) => a.cohortId === cohort?.id);
    const misResultados = evalsDeLaCohorte.map((a) => ({
      name: a.name,
      passed:
        resultados.find(
          (r) => r.assessmentId === a.id && r.enrollmentId === enrollment.id
        )?.passed ?? null,
      required: a.required,
    }));

    const { state, reasons } = approvalState(
      misResultados.filter((r) => r.required).map((r) => r.passed),
      pct,
      minPct
    );

    // Sin evaluaciones Y sin asistencia registrada no hay nada que afirmar.
    const sinDatos = misResultados.length === 0 && pct === null;

    const cert = certificados.find((c) => c.enrollmentId === enrollment.id);

    return {
      enrollmentId: enrollment.id,
      cohortId: cohort?.id ?? null,
      cohortName: cohort?.name ?? course?.name ?? "Lead sin cohorte",
      courseName: course?.name ?? "—",
      startDate: cohort?.startDate?.toISOString() ?? null,
      endDate: cohort?.endDate?.toISOString() ?? null,
      enrolledAt: enrollment.enrolledAt?.toISOString() ?? null,
      attendancePct: pct,
      minAttendancePct: minPct,
      approval: sinDatos ? "sin_datos" : state,
      approvalReasons: sinDatos
        ? ["Todavía no hay evaluaciones ni asistencia registradas en esta cohorte"]
        : reasons,
      assessments: misResultados.map(({ name, passed }) => ({ name, passed })),
      certificate: cert
        ? {
            code: cert.code,
            issuedAt: cert.issuedAt.toISOString(),
            revokedAt: cert.revokedAt?.toISOString() ?? null,
          }
        : null,
    };
  });

  const base: StudentRecordDto = {
    contact: {
      id: contact.id,
      name: fullName(contact),
      email: contact.email,
      phone: contact.phone,
      nationalId: contact.nationalId,
    },
    courses,
  };

  /**
   * 013 (T027, FR-010) — El estado de cuenta solo si la sesión puede verlo.
   *
   * El `return` temprano es deliberado: sin la capacidad, la clave `account`
   * **no existe** en la respuesta. Armarla y esconderla en la UI sería mandar
   * los montos por la red a quien no debe verlos — el mismo error que 012
   * corrigió en el roster.
   */
  if (!capabilities.includes("cobranza.ver")) return base;

  return { ...base, account: await buildAccount(organizationId, enrollmentIds) };
}

/** Saldo por moneda: nunca se suman monedas distintas (corrección de 007). */
async function buildAccount(
  organizationId: string,
  enrollmentIds: string[]
): Promise<RecordAccount[]> {
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

  const hoy = new Date();
  const porMoneda = new Map<Currency, RecordAccount>();

  for (const cuota of vigentes) {
    const acc =
      porMoneda.get(cuota.currency) ??
      ({
        currency: cuota.currency,
        total: 0,
        paid: 0,
        balance: 0,
        overdueCount: 0,
      } satisfies RecordAccount);

    const pagado = pagos
      .filter((p) => p.installmentId === cuota.id && !p.voidedAt)
      .reduce((sum, p) => sum + p.amount, 0);

    acc.total += cuota.amount;
    acc.paid += pagado;
    acc.balance += cuota.amount - pagado;
    if (pagado < cuota.amount && cuota.dueDate && cuota.dueDate < hoy) {
      acc.overdueCount += 1;
    }
    porMoneda.set(cuota.currency, acc);
  }

  return [...porMoneda.values()];
}
