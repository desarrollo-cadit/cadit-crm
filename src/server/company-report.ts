import { asc, eq, inArray } from "drizzle-orm";
import { cursoNoEsTaller } from "@/server/workshop-scope";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import {
  columnasDeClaseConLista,
  relojDeAsistencia,
  resolveMinAttendance,
  type AttendanceStatus,
  type RelojDeAsistencia,
} from "@/server/attendance";
import {
  asistenciaDeAlumno,
  estadoDeGrupoAlCorte,
  type ClaseDeConstancia,
} from "@/lib/constancia-empresa";
import {
  ETIQUETA_DE_RESULTADO,
  resultadoDeCursada,
  textoDeAsistencia,
  type EstadoDeGrupo,
  type ResultadoConfirmado,
  type ResultadoDeCursada,
} from "@/lib/resultado-de-cursada";
import { csvField } from "@/server/enrollments";
import { grupoTieneEvaluaciones } from "@/lib/taller-config";
import { grupoCompleto, visibilidadSegun } from "@/lib/resultado-final";
import { estadosAfirmados } from "@/server/resultados-confirmados";

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
 *
 * 2026-10-29 — El resultado ya NO sale de `approvalState` (que daba
 * "Aprobado" a quien estaba en un grupo EN CURSO sin evaluaciones
 * obligatorias): sale de `resultadoDeCursada`, la misma función que la
 * constancia en PDF. La asistencia se informa como "X de Y clases (Z%)", con
 * "hasta hoy" mientras el grupo no terminó.
 */

export type CompanyReportRow = {
  employeeName: string;
  email: string | null;
  cohortName: string;
  courseName: string;
  /** Estado del grupo HOY; `null` = la inscripción no tiene grupo. */
  cohortStatus: EstadoDeGrupo | null;
  /** Clases a las que asistió, de las dictadas que cuentan para esta persona. */
  attendedClasses: number | null;
  countedClasses: number | null;
  attendancePct: number | null;
  /** "8 de 10 clases (80%)", con "hasta hoy" si el grupo sigue en curso. */
  attendanceText: string | null;
  minAttendancePct: number | null;
  approval: ResultadoDeCursada;
  certificateCode: string | null;
};

export type CompanyReportDto = {
  company: { id: string; name: string };
  rows: CompanyReportRow[];
};

/**
 * Una fila, pura: la asistencia con la regla única y el resultado con
 * `resultadoDeCursada`. Separada para poder probar el bug que corrige.
 */
export function filaDeReporte(input: {
  employeeName: string;
  email: string | null;
  cohort: { name: string | null; startDate: Date; endDate: Date | null } | null;
  courseName: string | null;
  enrolledAt: Date | null;
  clases: readonly ClaseDeConstancia[];
  marcas: readonly { classSessionId: string; status: AttendanceStatus }[];
  minAttendancePct: number | null;
  resultadoConfirmado: ResultadoConfirmado;
  certificateCode: string | null;
  reloj: RelojDeAsistencia;
  /** 2026-10-29 — Taller sin evaluaciones: no hay resultado que informar. */
  tieneEvaluaciones?: boolean;
}): CompanyReportRow {
  const estado = input.cohort ? estadoDeGrupoAlCorte(input.cohort, input.reloj) : null;
  const asis = input.cohort
    ? asistenciaDeAlumno({ clases: input.clases }, { enrolledAt: input.enrolledAt, marcas: input.marcas }, input.reloj)
    : null;
  const conDatos = asis !== null && asis.pct !== null;
  return {
    employeeName: input.employeeName,
    email: input.email,
    cohortName: input.cohort?.name ?? input.courseName ?? "Sin grupo",
    courseName: input.courseName ?? "—",
    cohortStatus: estado,
    attendedClasses: conDatos ? asis.presentes : null,
    countedClasses: conDatos ? asis.cuentan : null,
    attendancePct: conDatos ? asis.pct : null,
    attendanceText: asis ? textoDeAsistencia(asis, estado === "en_curso") : null,
    minAttendancePct: input.minAttendancePct,
    approval: resultadoDeCursada({
      estadoDelGrupo: estado,
      resultadoConfirmado: input.resultadoConfirmado,
      tieneEvaluaciones: input.tieneEvaluaciones,
      grupoCompleto: grupoCompleto(input.clases, input.reloj),
    }),
    certificateCode: input.certificateCode,
  };
}

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
        eq(schema.enrollment.companyId, companyId),
        // 033 (FR-021) — El reporte habla del avance en cursos, no de talleres.
        cursoNoEsTaller(schema.course.kind, schema.cohort.registrationStatus)
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

  const reloj = await relojDeAsistencia(organizationId);
  const [asistencias, clases, certificados] = await Promise.all([
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
          .select(columnasDeClaseConLista())
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
      .from(schema.certificate)
      .where(
        scoped(
          schema.certificate.organizationId,
          organizationId,
          inArray(schema.certificate.enrollmentId, enrollmentIds)
        )
      ),
  ]);

  // 0086 — El resultado AFIRMADO (confirmado; la madre, desde sus módulos).
  const afirmados = await estadosAfirmados(organizationId, enrollmentIds);
  const confirmadoDe = (id: string): ResultadoConfirmado => {
    const a = afirmados.get(id);
    if (!a || a.sinResultado) return null;
    return a.state === "aprobado" || a.state === "reprobado" ? a.state : null;
  };

  const rows: CompanyReportRow[] = inscripciones.map(({ enrollment, contact, cohort, course }) =>
    filaDeReporte({
      employeeName: fullName(contact),
      email: contact.email,
      cohort: cohort ? { name: cohort.name, startDate: cohort.startDate, endDate: cohort.endDate } : null,
      courseName: course?.name ?? null,
      enrolledAt: enrollment.enrolledAt,
      clases: clases
        .filter((c) => c.cohortId === cohort?.id)
        .map((c) => ({
          id: c.id,
          date: c.date,
          endTime: c.endTime,
          canceledAt: c.canceledAt,
          tomada: Boolean(c.tomada),
        })),
      marcas: asistencias
        .filter((a) => a.enrollmentId === enrollment.id)
        .map((a) => ({ classSessionId: a.classSessionId, status: a.status })),
      minAttendancePct: resolveMinAttendance(
        cohort?.minAttendancePct ?? null,
        course?.minAttendancePct ?? null
      ),
      // 0086 — El resultado final CONFIRMADO por el profesor (decisión del dueño 2026-10-23).
      resultadoConfirmado: confirmadoDe(enrollment.id),
      // 0086 — Un certificado suspendido (sin resultado confirmado) no se informa.
      tieneEvaluaciones: grupoTieneEvaluaciones({
        courseKind: course?.kind,
        registrationStatus: cohort?.registrationStatus,
        hasAssessments: cohort?.hasAssessments,
      }),
      certificateCode:
        certificados.find(
          (c) =>
            c.enrollmentId === enrollment.id &&
            visibilidadSegun(c.revokedAt, afirmados.get(enrollment.id)) === "valido"
        )?.code ?? null,
      reloj,
    })
  );

  return { company, rows };
}

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
    "Grupo",
    "Asistencia",
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
      csvField(r.attendanceText ?? ""),
      csvField(r.attendancePct === null ? "" : String(r.attendancePct)),
      csvField(r.minAttendancePct === null ? "" : String(r.minAttendancePct)),
      csvField(ETIQUETA_DE_RESULTADO[r.approval]),
      csvField(r.certificateCode),
    ].join(",")
  );

  return [header, ...lines].join("\n");
}
