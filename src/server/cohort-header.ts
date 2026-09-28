import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { armarEncabezadoDeCohorte, type EncabezadoDeCohorte } from "@/lib/cohort-header";

/**
 * 029 — Las lecturas del encabezado de `/cohorts/[id]`. La regla vive en
 * `lib/cohort-header.ts`; acá solo se juntan las filas.
 *
 * Tres consultas como mucho, y dos en una cohorte común: la cohorte, y —solo
 * si es un módulo— su madre y sus hermanos. Nada de alumnos ni de plata: el
 * encabezado dice QUÉ es la cohorte, no cómo le va a nadie.
 *
 * Corre dentro de `withTenantTransaction` (lo abre la página): `cohort` está
 * bajo RLS y un server component no pasa por `withAuth`.
 */
export async function encabezadoDeCohorte(
  organizationId: string,
  cohortId: string
): Promise<EncabezadoDeCohorte | null> {
  const db = getDb();
  const columnas = {
    id: schema.cohort.id,
    name: schema.cohort.name,
    courseName: schema.course.name,
    startDate: schema.cohort.startDate,
    endDate: schema.cohort.endDate,
    isSpecialization: schema.cohort.isSpecialization,
    parentCohortId: schema.cohort.parentCohortId,
    position: schema.cohort.position,
  };

  const [cohorte] = await db
    .select(columnas)
    .from(schema.cohort)
    .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
    .where(scoped(schema.cohort.organizationId, organizationId, eq(schema.cohort.id, cohortId)))
    .limit(1);
  if (!cohorte) return null;
  if (!cohorte.parentCohortId) return armarEncabezadoDeCohorte(cohorte, null, []);

  const [madres, hermanos] = await Promise.all([
    db
      .select({ id: schema.cohort.id, name: schema.cohort.name, courseName: schema.course.name })
      .from(schema.cohort)
      .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          eq(schema.cohort.id, cohorte.parentCohortId)
        )
      )
      .limit(1),
    db
      .select({
        id: schema.cohort.id,
        name: schema.cohort.name,
        courseName: schema.course.name,
        position: schema.cohort.position,
        startDate: schema.cohort.startDate,
      })
      .from(schema.cohort)
      .innerJoin(schema.course, eq(schema.cohort.courseId, schema.course.id))
      .where(
        scoped(
          schema.cohort.organizationId,
          organizationId,
          eq(schema.cohort.parentCohortId, cohorte.parentCohortId)
        )
      ),
  ]);

  return armarEncabezadoDeCohorte(cohorte, madres[0] ?? null, hermanos);
}
