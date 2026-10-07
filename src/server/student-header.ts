import { and, eq, isNotNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { fullName } from "@/lib/utils";
import { migasDelLegajo, type MigaDelLegajo } from "@/lib/student-header";

/**
 * 2026-10-07 — El encabezado de `/contacts/[id]/legajo`: quién es, de dónde
 * se llegó y dos datos de estado que se miran antes que cualquier otra cosa
 * (si tiene acceso al portal y cuántas cursadas lleva).
 *
 * Mismo reparto que `cohort-header.ts`: la regla de las migas es pura
 * (`lib/student-header.ts`) y acá solo se juntan las filas. Corre dentro de
 * `withTenantTransaction` (lo abre la página): `contact` y `cohort` están bajo
 * RLS y un server component no pasa por `withAuth`.
 *
 * Nada de plata ni de notas: el encabezado dice QUIÉN es, no cómo le va.
 */

export type PortalAccessState = "activo" | "suspendido" | "sin_acceso";

export type StudentHeaderDto = {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  crumbs: MigaDelLegajo[];
  portalAccess: PortalAccessState;
  /** Inscripciones a una cohorte (los leads generales no cuentan). */
  cohortEnrollments: number;
};

export async function studentHeader(
  organizationId: string,
  contactId: string,
  cohortParam: string | null
): Promise<StudentHeaderDto | null> {
  const db = getDb();

  const [contact] = await db
    .select({
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      email: schema.contact.email,
      phone: schema.contact.phone,
    })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  if (!contact) return null;

  /**
   * El id de la cohorte viene de la URL: se busca DENTRO de la organización.
   * Uno ajeno o inexistente da cero filas y la miga cae a «Alumnos», sin un
   * error que confirme nada.
   */
  const [cohortRows, links, enrollments] = await Promise.all([
    cohortParam
      ? db
          .select({
            id: schema.cohort.id,
            name: schema.cohort.name,
            courseName: schema.course.name,
          })
          .from(schema.cohort)
          .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
          .where(
            scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortParam))
          )
          .limit(1)
      : Promise.resolve([]),
    db
      .select({ suspendedAt: schema.accountLink.suspendedAt })
      .from(schema.accountLink)
      .where(
        and(
          eq(schema.accountLink.organizationId, organizationId),
          eq(schema.accountLink.contactId, contactId),
          eq(schema.accountLink.kind, "alumno")
        )
      ),
    db
      .select({ id: schema.enrollment.id })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          eq(schema.enrollment.contactId, contactId),
          isNotNull(schema.enrollment.cohortId)
        )
      ),
  ]);

  const cohorte = cohortRows[0];
  const name = fullName(contact);

  return {
    contactId,
    name,
    email: contact.email,
    phone: contact.phone,
    crumbs: migasDelLegajo(
      name,
      cohorte ? { id: cohorte.id, name: cohorte.name ?? cohorte.courseName } : null
    ),
    portalAccess:
      links.length === 0
        ? "sin_acceso"
        : links.some((l) => l.suspendedAt === null)
          ? "activo"
          : "suspendido",
    cohortEnrollments: enrollments.length,
  };
}
