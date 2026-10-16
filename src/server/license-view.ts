import { asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import {
  armarVistaDeLicencias,
  estadoDeLicencia,
  faltantesDelGrupo,
  type FilaDeLicenciaVista,
  type ProgramaDeLaVista,
} from "@/lib/license-view";

/**
 * 035 (US3, FR-013..FR-016) — Lo que lee la vista de Licencias.
 *
 * Las cuentas son puras (`src/lib/license-view.ts`); acá sólo se juntan las
 * filas. Se seleccionan columnas, no filas enteras: el contacto viaja con su
 * nombre y nada más (ni teléfono ni correo), y la inscripción sin ningún
 * dato comercial. La vista se abre con `academico.ver`, y lo que ese permiso
 * no debe ver no se consulta.
 */

export type VistaDeLicenciasDto = {
  programas: ProgramaDeLaVista[];
  /** Las cohortes que aparecen en la lista, para el filtro. */
  cohortes: { id: string; name: string }[];
};

const nombreDeCohorte = (c: { cohortName: string | null; courseName: string | null }) =>
  c.cohortName ?? c.courseName ?? "Cohorte";

export async function vistaDeLicencias(organizationId: string): Promise<VistaDeLicenciasDto> {
  const db = getDb();
  const software = await db
    .select({
      id: schema.software.id,
      name: schema.software.name,
      total: schema.software.totalLicenses,
    })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId))
    .orderBy(asc(schema.software.name));
  if (software.length === 0) return { programas: [], cohortes: [] };

  const [licencias, grupos] = await Promise.all([
    db
      .select({
        licenseId: schema.license.id,
        enrollmentId: schema.license.enrollmentId,
        softwareId: schema.license.softwareId,
        source: schema.license.source,
        assignedAt: schema.license.assignedAt,
        expiresAt: schema.license.expiresAt,
        contactId: schema.contact.id,
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
        cohortId: schema.cohort.id,
        cohortName: schema.cohort.name,
        courseName: schema.course.name,
        startDate: schema.cohort.startDate,
        endDate: schema.cohort.endDate,
      })
      .from(schema.license)
      .innerJoin(schema.enrollment, eq(schema.license.enrollmentId, schema.enrollment.id))
      .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
      .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
      .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .where(
        scoped(schema.license.organizationId, organizationId, eq(schema.license.assigned, true))
      )
      .orderBy(asc(schema.contact.firstName)),
    db
      .select({
        cohortId: schema.cohortGroupSoftware.cohortId,
        softwareId: schema.cohortGroupSoftware.softwareId,
      })
      .from(schema.cohortGroupSoftware)
      .where(scoped(schema.cohortGroupSoftware.organizationId, organizationId)),
  ]);

  const ahora = new Date();
  const filas: FilaDeLicenciaVista[] = licencias.map((l) => ({
    licenseId: l.licenseId,
    enrollmentId: l.enrollmentId,
    softwareId: l.softwareId,
    contactId: l.contactId,
    contactName: fullName(l),
    cohortId: l.cohortId,
    cohortName: l.cohortId ? nombreDeCohorte(l) : null,
    source: l.source,
    assignedAt: l.assignedAt?.toISOString() ?? null,
    expiresAt: l.expiresAt?.toISOString() ?? null,
    // La misma regla que `contarOcupadas` (el stock): fechas nulas = no terminó.
    estado: estadoDeLicencia(
      { expiresAt: l.expiresAt },
      { startDate: l.startDate, endDate: l.endDate },
      ahora
    ),
  }));

  // FR-016 — Los miembros ACTIVOS de los grupos con programas asignados.
  const cohortesDeGrupo = [...new Set(grupos.map((g) => g.cohortId))];
  const miembros = cohortesDeGrupo.length
    ? await db
        .select({
          enrollmentId: schema.enrollment.id,
          cohortId: schema.cohort.id,
          contactId: schema.contact.id,
          firstName: schema.contact.firstName,
          lastName: schema.contact.lastName,
          cohortName: schema.cohort.name,
          courseName: schema.course.name,
        })
        .from(schema.enrollment)
        .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
        .innerJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
        .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
        .where(
          scoped(
            schema.enrollment.organizationId,
            organizationId,
            inArray(schema.enrollment.cohortId, cohortesDeGrupo),
            isNull(schema.contact.archivedAt)
          )
        )
    : [];

  const faltantes = faltantesDelGrupo(
    grupos,
    miembros.map((m) => ({
      enrollmentId: m.enrollmentId,
      cohortId: m.cohortId,
      contactId: m.contactId,
      contactName: fullName(m),
      cohortName: nombreDeCohorte(m),
    })),
    filas
  );

  const cohortes = new Map<string, string>();
  for (const f of filas) if (f.cohortId && f.cohortName) cohortes.set(f.cohortId, f.cohortName);
  for (const f of faltantes) cohortes.set(f.cohortId, f.cohortName);

  return {
    programas: armarVistaDeLicencias(software, filas, faltantes),
    cohortes: [...cohortes]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
