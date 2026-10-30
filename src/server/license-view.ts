import { asc, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { alias } from "drizzle-orm/pg-core";
import { fullName } from "@/lib/utils";
import { correoDeLicencia } from "@/lib/license-email";
import { asientosAjenos, fotosDeLosEquipos } from "@/server/license-ajenos";
import {
  armarVistaDeLicencias,
  estadoDeLicencia,
  estadoDeLicenciaDeProfesor,
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
  /** 0087 — Los equipos de licencias (los archivados al final). */
  equipos: {
    id: string;
    name: string;
    autodeskAlias: string | null;
    archived: boolean;
    /** 0089 — De cuándo es la última importación de Autodesk de este equipo. */
    importadoEn: string | null;
  }[];
};

const nombreDeCohorte = (c: { cohortName: string | null; courseName: string | null }) =>
  c.cohortName ?? c.courseName ?? "Grupo";

export async function vistaDeLicencias(
  organizationId: string,
  /**
   * 2026-10-21 — `contactos.ver`: el correo de la licencia viaja solo para
   * quien ya ve el correo del alumno. Sin ella, ni se consulta.
   */
  opts: { conCorreo?: boolean } = {}
): Promise<VistaDeLicenciasDto> {
  const db = getDb();
  const software = await db
    .select({
      id: schema.software.id,
      name: schema.software.name,
      photoMimeType: schema.software.photoMimeType,
    })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId))
    .orderBy(asc(schema.software.name));
  if (software.length === 0) return { programas: [], cohortes: [], equipos: [] };

  // 0087 — El cupo es de cada equipo; el total de un programa es la suma de
  // los equipos ACTIVOS (un archivado no tiene licencias ocupadas).
  const [equiposRows, cupos] = await Promise.all([
    db
      .select({
        id: schema.licenseTeam.id,
        name: schema.licenseTeam.name,
        autodeskAlias: schema.licenseTeam.autodeskAlias,
        archivedAt: schema.licenseTeam.archivedAt,
      })
      .from(schema.licenseTeam)
      .where(scoped(schema.licenseTeam.organizationId, organizationId)),
    db
      .select({
        teamId: schema.licenseTeamSeat.teamId,
        softwareId: schema.licenseTeamSeat.softwareId,
        total: schema.licenseTeamSeat.total,
      })
      .from(schema.licenseTeamSeat)
      .where(scoped(schema.licenseTeamSeat.organizationId, organizationId)),
  ]);
  // 0089 — Lo que Autodesk tiene ocupado y el campus no cuenta, y de cuándo es esa foto.
  const [ajenos, fotos] = await Promise.all([
    asientosAjenos(organizationId),
    fotosDeLosEquipos(organizationId),
  ]);
  const equipos = equiposRows
    .map((e) => ({
      id: e.id,
      name: e.name,
      autodeskAlias: e.autodeskAlias,
      archived: e.archivedAt !== null,
      importadoEn: fotos.get(e.id)?.toISOString() ?? null,
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || a.name.localeCompare(b.name, "es"));
  const activos = new Set(equipos.filter((e) => !e.archived).map((e) => e.id));

  const [licencias, grupos] = await Promise.all([
    db
      .select({
        licenseId: schema.license.id,
        enrollmentId: schema.license.enrollmentId,
        teacherId: schema.license.teacherId,
        softwareId: schema.license.softwareId,
        teamId: schema.license.teamId,
        source: schema.license.source,
        assignedAt: schema.license.assignedAt,
        expiresAt: schema.license.expiresAt,
        contactId: schema.contact.id,
        firstName: schema.contact.firstName,
        lastName: schema.contact.lastName,
        teacherName: schema.teacher.name,
        teacherEmail: schema.teacher.email,
        cohortId: schema.cohort.id,
        cohortName: schema.cohort.name,
        courseName: schema.course.name,
        startDate: schema.cohort.startDate,
        endDate: schema.cohort.endDate,
      })
      .from(schema.license)
      // 0088 — leftJoin: la licencia de un profesor no tiene inscripción ni contacto.
      .leftJoin(schema.enrollment, eq(schema.license.enrollmentId, schema.enrollment.id))
      .leftJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
      .leftJoin(schema.teacher, eq(schema.license.teacherId, schema.teacher.id))
      .leftJoin(schema.cohort, eq(schema.enrollment.cohortId, schema.cohort.id))
      .leftJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .where(
        scoped(schema.license.organizationId, organizationId, eq(schema.license.assigned, true))
      )
      .orderBy(asc(schema.contact.firstName), asc(schema.teacher.name)),
    db
      .select({
        cohortId: schema.cohortGroupSoftware.cohortId,
        softwareId: schema.cohortGroupSoftware.softwareId,
      })
      .from(schema.cohortGroupSoftware)
      .where(scoped(schema.cohortGroupSoftware.organizationId, organizationId)),
  ]);

  const correos = opts.conCorreo
    ? await correosDeLicencia(organizationId, licencias.map((l) => l.licenseId))
    : null;

  const ahora = new Date();
  const filas: FilaDeLicenciaVista[] = licencias.map((l) => {
    const esProfesor = l.teacherId !== null;
    return {
      ...(correos
        ? {
            licenseEmail: esProfesor
              ? { email: l.teacherEmail, distinto: false }
              : (correos.get(l.licenseId) ?? { email: null, distinto: false }),
          }
        : {}),
      licenseId: l.licenseId,
      enrollmentId: l.enrollmentId,
      teacherId: l.teacherId,
      titular: esProfesor ? ("profesor" as const) : ("alumno" as const),
      softwareId: l.softwareId,
      teamId: l.teamId,
      contactId: esProfesor ? null : l.contactId,
      contactName: esProfesor
        ? (l.teacherName ?? "Profesor")
        : fullName({ firstName: l.firstName ?? "", lastName: l.lastName ?? "" }),
      cohortId: l.cohortId,
      cohortName: l.cohortId ? nombreDeCohorte(l) : null,
      source: l.source,
      assignedAt: l.assignedAt?.toISOString() ?? null,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      // La misma regla que `contarOcupadas` (el stock): fechas nulas = no terminó;
      // y un profesor, sin cohorte, solo deja de ocupar si la licencia vence.
      estado: esProfesor
        ? estadoDeLicenciaDeProfesor({ expiresAt: l.expiresAt }, ahora)
        : estadoDeLicencia(
            { expiresAt: l.expiresAt },
            { startDate: l.startDate, endDate: l.endDate },
            ahora
          ),
    };
  });

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
    programas: armarVistaDeLicencias(
      software.map((s) => ({
        id: s.id,
        name: s.name,
        total: cupos
          .filter((c) => c.softwareId === s.id && activos.has(c.teamId))
          .reduce((suma, c) => suma + c.total, 0),
        hasPhoto: s.photoMimeType !== null,
      })),
      filas,
      faltantes,
      cupos,
      ajenos
    ),
    cohortes: [...cohortes]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es")),
    equipos,
  };
}

/**
 * 2026-10-21 — El correo de cada licencia, resuelto con `correoDeLicencia`:
 * el de la inscripción, el de su madre (hija de un módulo) o el del alumno.
 */
async function correosDeLicencia(
  organizationId: string,
  licenseIds: string[]
): Promise<Map<string, { email: string | null; distinto: boolean }>> {
  const salida = new Map<string, { email: string | null; distinto: boolean }>();
  if (licenseIds.length === 0) return salida;
  const madre = alias(schema.enrollment, "madre");
  const filas = await getDb()
    .select({
      licenseId: schema.license.id,
      licenseEmail: schema.enrollment.licenseEmail,
      parentLicenseEmail: madre.licenseEmail,
      contactEmail: schema.contact.email,
    })
    .from(schema.license)
    .innerJoin(schema.enrollment, eq(schema.license.enrollmentId, schema.enrollment.id))
    .innerJoin(schema.contact, eq(schema.enrollment.contactId, schema.contact.id))
    .leftJoin(madre, eq(schema.enrollment.parentEnrollmentId, madre.id))
    .where(
      scoped(schema.license.organizationId, organizationId, inArray(schema.license.id, licenseIds))
    );
  for (const f of filas) salida.set(f.licenseId, correoDeLicencia(f));
  return salida;
}
