import { asc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import { estadoDeModulo, type ModuleState } from "@/lib/approval";
import { afirmadoConSugerencia } from "@/lib/resultado-final";
import { resultadoConfirmadoPorInscripcion } from "@/server/resultados-confirmados";
import { resumirLicencias } from "@/lib/license-rules";
import { softwareDelGrupo } from "@/server/licenses";
import {
  asistenciaTomadaSql,
  attendanceByModule,
  relojDeAsistencia,
  resolveMinAttendance,
} from "@/server/attendance";
import { dispensaDeInscripcion } from "@/server/grading";

/**
 * 034 (US4, FR-016/FR-017) — La pestaña Alumnos de un MÓDULO.
 *
 * Un módulo no inscribe (028, FR-010: las hijas cuelgan de la madre), no
 * asigna cursos offline ni da acceso al portal (eso se gestiona en la
 * especialización) y no muestra plata (la venta es la madre). Lo que sí tiene
 * es su lista: quién lo cursa, con su asistencia y su estado, y dos acciones
 * — sacar del módulo y asignarle licencias del módulo —.
 *
 * Por eso NO reusa `getCohortRoster`: ese arma monto, cuotas, vendedor,
 * teléfono y acceso al portal, y reusarlo es exactamente cómo un dato
 * comercial termina en la pantalla equivocada. **Un dato que no se debe ver
 * no se consulta**: esta lectura no nombra ninguna columna de plata.
 */

export type AlumnoDelModuloDto = {
  /** La inscripción HIJA, contra la que se registra todo. */
  enrollmentId: string;
  contact: { id: string; name: string; archived: boolean };
  /** El porcentaje real; `null` = nadie pasó lista todavía (no es 0%). */
  attendancePct: number | null;
  state: ModuleState;
  reasons: string[];
  /** Cursa el módulo desde OTRA especialización (recursada, 028 FR-008). */
  otherProgramName: string | null;
  licenseSoftwareIds: string[];
};

export type RosterDeModuloDto = {
  cohortId: string;
  minAttendancePct: number | null;
  /** El software declarado por el módulo: lo que se le puede asignar. */
  software: { id: string; name: string }[];
  /** 035 (FR-012) — Lo asignado al grupo del módulo: sin control por alumno. */
  groupSoftware: { id: string; name: string }[];
  students: AlumnoDelModuloDto[];
};

/** `null` = la cohorte no existe o no es un módulo. */
export async function rosterDeModulo(
  organizationId: string,
  cohortId: string
): Promise<RosterDeModuloDto | null> {
  const db = getDb();
  const [cohorte] = await db
    .select({
      id: schema.cohort.id,
      parentCohortId: schema.cohort.parentCohortId,
      minAttendancePct: schema.cohort.minAttendancePct,
      courseMinAttendancePct: schema.course.minAttendancePct,
    })
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohorte?.parentCohortId) return null;

  const minPct = resolveMinAttendance(cohorte.minAttendancePct, cohorte.courseMinAttendancePct);

  const [software, hijas] = await Promise.all([
    db
      .select({ id: schema.software.id, name: schema.software.name })
      .from(schema.cohortSoftware)
      .innerJoin(schema.software, eq(schema.software.id, schema.cohortSoftware.softwareId))
      .where(
        scoped(
          schema.cohortSoftware.organizationId,
          organizationId,
          eq(schema.cohortSoftware.cohortId, cohortId)
        )
      ),
    db
      .select({
        id: schema.enrollment.id,
        parentEnrollmentId: schema.enrollment.parentEnrollmentId,
        enrolledAt: schema.enrollment.enrolledAt,
        attendanceWaiverAt: schema.enrollment.attendanceWaiverAt,
        attendanceWaiverReason: schema.enrollment.attendanceWaiverReason,
        attendanceWaiverRevokedAt: schema.enrollment.attendanceWaiverRevokedAt,
        contactId: schema.contact.id,
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
        archivedAt: schema.contact.archivedAt,
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
      .orderBy(asc(schema.contact.firstName)),
  ]);

  // 035 (FR-007) — lo del grupo de ESTE módulo.
  const groupSoftware = (await softwareDelGrupo(organizationId, [cohortId])).map((g) => ({
    id: g.softwareId,
    name: g.name,
  }));
  const base = { cohortId, minAttendancePct: minPct, software, groupSoftware };
  if (hijas.length === 0) return { ...base, students: [] };
  const ids = hijas.map((h) => h.id);
  const madreIds = [...new Set(hijas.map((h) => h.parentEnrollmentId).filter((m): m is string => !!m))];

  const reloj = await relojDeAsistencia(organizationId);
  const [sesiones, marcas, evaluaciones, resultados, licencias, madres] = await Promise.all([
    db
      .select({
        id: schema.classSession.id,
        cohortId: schema.classSession.cohortId,
        date: schema.classSession.date,
        endTime: schema.classSession.endTime,
        canceledAt: schema.classSession.canceledAt,
        tomada: asistenciaTomadaSql(),
      })
      .from(schema.classSession)
      .where(
        scoped(
          schema.classSession.organizationId,
          organizationId,
          eq(schema.classSession.cohortId, cohortId)
        )
      ),
    db
      .select({
        enrollmentId: schema.attendance.enrollmentId,
        classSessionId: schema.attendance.classSessionId,
        status: schema.attendance.status,
      })
      .from(schema.attendance)
      .where(
        scoped(schema.attendance.organizationId, organizationId, inArray(schema.attendance.enrollmentId, ids))
      ),
    db
      .select({ id: schema.assessment.id, required: schema.assessment.required })
      .from(schema.assessment)
      .where(
        scoped(schema.assessment.organizationId, organizationId, eq(schema.assessment.cohortId, cohortId))
      ),
    db
      .select({
        assessmentId: schema.assessmentResult.assessmentId,
        enrollmentId: schema.assessmentResult.enrollmentId,
        passed: schema.assessmentResult.passed,
      })
      .from(schema.assessmentResult)
      .where(
        scoped(
          schema.assessmentResult.organizationId,
          organizationId,
          inArray(schema.assessmentResult.enrollmentId, ids)
        )
      ),
    db
      .select({
        enrollmentId: schema.license.enrollmentId,
        softwareId: schema.license.softwareId,
        assigned: schema.license.assigned,
      })
      .from(schema.license)
      .where(scoped(schema.license.organizationId, organizationId, inArray(schema.license.enrollmentId, ids))),
    madreIds.length
      ? db
          .select({
            id: schema.enrollment.id,
            cohortId: schema.enrollment.cohortId,
            cohortName: schema.cohort.name,
          })
          .from(schema.enrollment)
          .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
          .where(
            scoped(schema.enrollment.organizationId, organizationId, inArray(schema.enrollment.id, madreIds))
          )
      : Promise.resolve([] as { id: string; cohortId: string | null; cohortName: string | null }[]),
  ]);

  const porcentaje = attendanceByModule(
    hijas.map((h) => ({ enrollmentId: h.id, cohortId, enrolledAt: h.enrolledAt })),
    sesiones,
    marcas,
    reloj
  );
  const madrePorId = new Map(madres.map((m) => [m.id, m]));
  const obligatorias = evaluaciones.filter((a) => a.required);
  // 0086 — El resultado final CONFIRMADO de cada alumno del módulo.
  const confirmados = await resultadoConfirmadoPorInscripcion(organizationId, ids);

  return {
    ...base,
    students: hijas.map((h) => {
      const pct = porcentaje.get(h.id) ?? null;
      const evaluadas = obligatorias.map(
        (a) => resultados.find((r) => r.assessmentId === a.id && r.enrollmentId === h.id)?.passed ?? null
      );
      // 0086 — El cálculo es una SUGERENCIA; el estado es el confirmado.
      const { state, reasons } = afirmadoConSugerencia(
        confirmados.get(h.id) ?? null,
        estadoDeModulo(evaluadas, pct, minPct, dispensaDeInscripcion(h))
      );
      const madre = h.parentEnrollmentId ? madrePorId.get(h.parentEnrollmentId) : undefined;
      const otra = madre && madre.cohortId !== cohorte.parentCohortId;
      return {
        enrollmentId: h.id,
        contact: { id: h.contactId, name: fullName(h), archived: h.archivedAt !== null },
        attendancePct: pct,
        state,
        reasons,
        otherProgramName: otra ? (madre.cohortName ?? "otra especialización") : null,
        licenseSoftwareIds: resumirLicencias(licencias.filter((l) => l.enrollmentId === h.id))
          .licenseSoftwareIds,
      };
    }),
  };
}
