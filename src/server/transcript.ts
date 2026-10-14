import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { armarEscolaridad, type CursadaInput, type Escolaridad } from "@/lib/escolaridad";
import { fullName } from "@/lib/utils";
import { attendancePercentage, resolveMinAttendance } from "@/server/attendance";
import { getBranding } from "@/server/branding";
import { dispensaDeInscripcion } from "@/server/grading";

/**
 * 031 (T038, DV-011) — Las LECTURAS de la escolaridad.
 *
 * Trae filas planas y se las pasa a `armarEscolaridad` (puro): este módulo no
 * decide ningún estado. Lo comparten la puerta del staff y la del alumno, así
 * que las dos imprimen el mismo documento.
 *
 * **No importa `student-record.ts`** aunque calcule casi lo mismo. Casi: el
 * legajo trae teléfono, correo y el estado de cuenta, y reusarlo es
 * exactamente cómo un dato de cobranza termina impreso en un papel que el
 * alumno le da a un empleador. Por la misma razón las columnas se nombran una
 * por una: `select()` entero de la inscripción traería el monto.
 *
 * La asistencia sale de `attendancePercentage`, la función del legajo, con la
 * misma regla: sin una sola marca, `null` —nadie pasó lista— y no 0%.
 */
export async function escolaridadDeContacto(
  organizationId: string,
  contactId: string
): Promise<{ escolaridad: Escolaridad; timezone: string } | null> {
  const db = getDb();

  const contacto = (
    await db
      .select({
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
        nationalId: schema.contact.nationalId,
      })
      .from(schema.contact)
      .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
      .limit(1)
  )[0];
  if (!contacto) return null;

  const [academia, marca, inscripciones] = await Promise.all([
    db
      .select({ name: schema.organization.name, timezone: schema.organization.timezone })
      .from(schema.organization)
      .where(eq(schema.organization.id, organizationId))
      .limit(1),
    // El nombre que la academia configuró en su marca, no `organization.name`:
    // ese lo arma el alta ("Negocio de <usuario>") y nadie lo edita.
    getBranding(organizationId),
    db
      .select({
        enrollment: {
          id: schema.enrollment.id,
          parentEnrollmentId: schema.enrollment.parentEnrollmentId,
          enrolledAt: schema.enrollment.enrolledAt,
          attendanceWaiverAt: schema.enrollment.attendanceWaiverAt,
          attendanceWaiverReason: schema.enrollment.attendanceWaiverReason,
          attendanceWaiverRevokedAt: schema.enrollment.attendanceWaiverRevokedAt,
        },
        cohort: {
          id: schema.cohort.id,
          name: schema.cohort.name,
          startDate: schema.cohort.startDate,
          endDate: schema.cohort.endDate,
          minAttendancePct: schema.cohort.minAttendancePct,
          position: schema.cohort.position,
        },
        course: {
          name: schema.course.name,
          minAttendancePct: schema.course.minAttendancePct,
        },
        waiverAuthor: schema.user.name,
      })
      .from(schema.enrollment)
      // Una inscripción sin cohorte es un lead del pipeline, no una cursada.
      .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
      .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .leftJoin(schema.user, eq(schema.enrollment.attendanceWaiverBy, schema.user.id))
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          eq(schema.enrollment.contactId, contactId)
        )
      )
      .orderBy(asc(schema.cohort.startDate)),
  ]);

  const enrollmentIds = inscripciones.map((i) => i.enrollment.id);
  const cohortIds = [...new Set(inscripciones.map((i) => i.cohort.id))];

  // Todo de una vez y cruzado en memoria: tres cursadas no son quince consultas.
  const [asistencias, clases, evaluaciones, resultados] = enrollmentIds.length
    ? await Promise.all([
        db
          .select({
            enrollmentId: schema.attendance.enrollmentId,
            classSessionId: schema.attendance.classSessionId,
            status: schema.attendance.status,
          })
          .from(schema.attendance)
          .where(
            scoped(
              schema.attendance.organizationId,
              organizationId,
              inArray(schema.attendance.enrollmentId, enrollmentIds)
            )
          ),
        db
          .select({
            id: schema.classSession.id,
            cohortId: schema.classSession.cohortId,
            date: schema.classSession.date,
            canceledAt: schema.classSession.canceledAt,
          })
          .from(schema.classSession)
          .where(
            scoped(
              schema.classSession.organizationId,
              organizationId,
              inArray(schema.classSession.cohortId, cohortIds)
            )
          ),
        db
          .select({
            id: schema.assessment.id,
            cohortId: schema.assessment.cohortId,
            name: schema.assessment.name,
            required: schema.assessment.required,
            scale: schema.assessment.scale,
            position: schema.assessment.position,
          })
          .from(schema.assessment)
          .where(
            scoped(
              schema.assessment.organizationId,
              organizationId,
              inArray(schema.assessment.cohortId, cohortIds)
            )
          )
          .orderBy(asc(schema.assessment.position)),
        // El resultado OFICIAL: solo existe publicado (DV-003). Un borrador o
        // una corrección esperando aprobación no tienen fila acá.
        db
          .select({
            assessmentId: schema.assessmentResult.assessmentId,
            enrollmentId: schema.assessmentResult.enrollmentId,
            passed: schema.assessmentResult.passed,
            score: schema.assessmentResult.score,
          })
          .from(schema.assessmentResult)
          .where(
            scoped(
              schema.assessmentResult.organizationId,
              organizationId,
              inArray(schema.assessmentResult.enrollmentId, enrollmentIds)
            )
          ),
      ])
    : [[], [], [], []];

  const cursadas: CursadaInput[] = inscripciones.map(({ enrollment, cohort, course, waiverAuthor }) => {
    const propias = asistencias.filter((a) => a.enrollmentId === enrollment.id);
    const asistenciaPct =
      propias.length === 0
        ? null
        : attendancePercentage(
            clases
              .filter((c) => c.cohortId === cohort.id)
              .map((c) => ({
                sessionDate: c.date,
                canceled: Boolean(c.canceledAt),
                status: propias.find((a) => a.classSessionId === c.id)?.status ?? null,
              })),
            enrollment.enrolledAt
          );

    return {
      enrollmentId: enrollment.id,
      parentEnrollmentId: enrollment.parentEnrollmentId ?? null,
      curso: course.name,
      cohorte: cohort.name ?? course.name,
      desde: cohort.startDate,
      hasta: cohort.endDate ?? null,
      asistenciaPct,
      minAsistenciaPct: resolveMinAttendance(
        cohort.minAttendancePct ?? null,
        course.minAttendancePct ?? null
      ),
      dispensa: dispensaDeInscripcion({ ...enrollment, attendanceWaiverByName: waiverAuthor }),
      posicion: cohort.position ?? null,
      evaluaciones: evaluaciones
        .filter((a) => a.cohortId === cohort.id)
        .map((a) => {
          const r = resultados.find(
            (x) => x.assessmentId === a.id && x.enrollmentId === enrollment.id
          );
          // Lo que no dice "numeric" es aprobado/no aprobado, como toda evaluación anterior a 031.
          const escala = a.scale === "numeric" ? ("numeric" as const) : ("pass_fail" as const);
          return {
            nombre: a.name,
            obligatoria: a.required,
            escala,
            nota: escala === "numeric" ? (r?.score ?? null) : null,
            aprobada: r?.passed ?? null,
          };
        }),
    };
  });

  const org = academia[0];
  return {
    timezone: org?.timezone ?? "America/Montevideo",
    escolaridad: armarEscolaridad({
      academia: marca.name,
      alumno: { nombre: fullName(contacto), documento: contacto.nationalId ?? null },
      emitidaEl: new Date(),
      cursadas,
    }),
  };
}
