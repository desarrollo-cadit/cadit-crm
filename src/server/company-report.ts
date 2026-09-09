import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import { attendancePercentage, resolveMinAttendance } from "@/server/attendance";
import { approvalState } from "@/server/grading";
import { csvField } from "@/server/enrollments";

/**
 * 013 (T032, FR-010c) — Reporte por EMPRESA.
 *
 * **Sustituye al portal corporativo**, que el dueño descartó el 2026-08-26. La
 * necesidad que quedaba era real —"¿cómo van mis empleados?"— y se resuelve
 * con un reporte que el staff exporta y manda, no con una tercera audiencia
 * con login, permisos y superficie propia.
 *
 * Alcance medido: **14 inscripciones con empresa, 5 empresas reales**. Para
 * ese tamaño, un portal habría sido construir un edificio para una persona.
 */

export type CompanyReportRow = {
  employeeName: string;
  email: string | null;
  cohortName: string;
  courseName: string;
  attendancePct: number | null;
  minAttendancePct: number | null;
  approval: "aprobado" | "reprobado" | "pendiente" | "sin_datos";
  certificateCode: string | null;
};

export type CompanyReportDto = {
  company: { id: string; name: string };
  rows: CompanyReportRow[];
};

export async function companyReport(
  organizationId: string,
  companyId: string
): Promise<CompanyReportDto | null> {
  const db = getDb();

  const companies = await db
    .select({ id: schema.company.id, name: schema.company.legalName })
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, companyId)))
    .limit(1);
  const company = companies[0];
  if (!company) return null;

  const inscripciones = await db
    .select({
      enrollment: schema.enrollment,
      contact: schema.contact,
      cohort: schema.cohort,
      course: schema.course,
    })
    .from(schema.enrollment)
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
    .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.companyId, companyId)
      )
    )
    .orderBy(asc(schema.contact.firstName));

  if (inscripciones.length === 0) {
    return { company, rows: [] };
  }

  const enrollmentIds = inscripciones.map((i) => i.enrollment.id);
  const cohortIds = inscripciones
    .map((i) => i.cohort?.id)
    .filter((id): id is string => Boolean(id));

  const [asistencias, clases, resultados, evaluaciones, certificados] =
    await Promise.all([
      db
        .select()
        .from(schema.attendance)
        .where(
          scoped(
            schema.attendance.organizationId,
            organizationId,
            inArray(schema.attendance.enrollmentId, enrollmentIds)
          )
        ),
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
      db
        .select()
        .from(schema.assessmentResult)
        .where(
          scoped(
            schema.assessmentResult.organizationId,
            organizationId,
            inArray(schema.assessmentResult.enrollmentId, enrollmentIds)
          )
        ),
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
      db
        .select()
        .from(schema.certificate)
        .where(
          scoped(
            schema.certificate.organizationId,
            organizationId,
            inArray(schema.certificate.enrollmentId, enrollmentIds)
          )
        ),
    ]);

  const rows: CompanyReportRow[] = inscripciones.map(
    ({ enrollment, contact, cohort, course }) => {
      const clasesDeLaCohorte = clases.filter((c) => c.cohortId === cohort?.id);
      // Mismo criterio que el legajo: sin marcas de asistencia no hay
      // porcentaje que informar. 0% sin lista tomada acusa a quien no faltó.
      const asistenciaDeEste = asistencias.filter((a) => a.enrollmentId === enrollment.id);
      const pct = asistenciaDeEste.length === 0 ? null : attendancePercentage(
        clasesDeLaCohorte.map((c) => ({
          sessionDate: c.date,
          canceled: Boolean(c.canceledAt),
          status:
            asistenciaDeEste.find((a) => a.classSessionId === c.id)?.status ?? null,
        })),
        enrollment.enrolledAt
      );

      const minPct = resolveMinAttendance(
        cohort?.minAttendancePct ?? null,
        course?.minAttendancePct ?? null
      );

      const obligatorias = evaluaciones
        .filter((a) => a.cohortId === cohort?.id && a.required)
        .map(
          (a) =>
            resultados.find(
              (r) => r.assessmentId === a.id && r.enrollmentId === enrollment.id
            )?.passed ?? null
        );

      const { state } = approvalState(obligatorias, pct, minPct);
      // Mismo criterio que el legajo: sin datos no se afirma nada.
      const sinDatos = obligatorias.length === 0 && pct === null;

      const cert = certificados.find(
        (c) => c.enrollmentId === enrollment.id && !c.revokedAt
      );

      return {
        employeeName: fullName(contact),
        email: contact.email,
        cohortName: cohort?.name ?? course?.name ?? "Sin cohorte",
        courseName: course?.name ?? "—",
        attendancePct: pct,
        minAttendancePct: minPct,
        approval: sinDatos ? "sin_datos" : state,
        certificateCode: cert?.code ?? null,
      };
    }
  );

  return { company, rows };
}

const APROBACION_CSV: Record<CompanyReportRow["approval"], string> = {
  aprobado: "Aprobado",
  reprobado: "No aprobado",
  pendiente: "En curso",
  sin_datos: "Sin datos",
};

/**
 * 013 (T032) — El reporte en CSV, para mandárselo a la empresa.
 *
 * **Misma protección anti-inyección de fórmulas que el roster** (`csvField`):
 * el nombre de un alumno puede haber entrado por un formulario público sin
 * autenticar, y un `=HYPERLINK(...)` llegaría hasta la máquina de quien abre
 * el archivo en la empresa — que es alguien de afuera de la academia. Acá
 * importa incluso más que en el export interno.
 *
 * **No lleva montos**: es un reporte de avance académico para un tercero. Lo
 * que la empresa pagó es entre la empresa y la academia, no algo que se manda
 * en la misma planilla que las notas de sus empleados.
 */
export function exportCompanyReportCsv(report: CompanyReportDto): string {
  const header = [
    "Empleado",
    "Correo",
    "Curso",
    "Cohorte",
    "Asistencia %",
    "Mínimo %",
    "Estado",
    "Certificado",
  ].join(",");

  const lines = report.rows.map((r) =>
    [
      csvField(r.employeeName),
      csvField(r.email),
      csvField(r.courseName),
      csvField(r.cohortName),
      csvField(r.attendancePct === null ? "" : String(r.attendancePct)),
      csvField(r.minAttendancePct === null ? "" : String(r.minAttendancePct)),
      csvField(APROBACION_CSV[r.approval]),
      csvField(r.certificateCode),
    ].join(",")
  );

  return [header, ...lines].join("\n");
}
