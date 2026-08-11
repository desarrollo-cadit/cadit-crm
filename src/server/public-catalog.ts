import { asc, eq, gt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * 005 (T041, DV-010, US7) — "una instancia = un negocio": resuelve la única
 * organización de la instalación, mismo criterio que
 * `isPublicSignupAllowed` (`src/server/auth/registration.ts`). Si hay 0 o
 * más de 1 organización (instancia recién levantada o mal configurada),
 * devuelve null — el endpoint público responde vacío/404 en vez de
 * adivinar cuál mostrar.
 */
export async function resolveSoleOrganizationId(): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.organization.id })
    .from(schema.organization)
    .limit(2);
  if (rows.length !== 1) return null;
  return rows[0]!.id;
}

export type PublicCohortDto = { id: string; startDate: string };

export type PublicCourseDto = {
  id: string;
  name: string;
  description: string | null;
  nextCohorts: PublicCohortDto[];
};

/**
 * 005 (T041, FR-020/FR-021/FR-022) — catálogo público: solo `id`/`name`/
 * `description` del curso y `nextCohorts` (camadas con `startDate` futura).
 * Nunca toca `contact`/`enrollment`/`license` (FR-022).
 */
export async function listPublicCourses(): Promise<PublicCourseDto[]> {
  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) return [];

  const db = getDb();
  const courses = await db
    .select({ id: schema.course.id, name: schema.course.name, description: schema.course.description })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId))
    .orderBy(asc(schema.course.name));

  const cohorts = await db
    .select({
      id: schema.cohort.id,
      courseId: schema.cohort.courseId,
      startDate: schema.cohort.startDate,
    })
    .from(schema.cohort)
    .where(scoped(schema.cohort.organizationId, organizationId, gt(schema.cohort.startDate, new Date())))
    .orderBy(asc(schema.cohort.startDate));

  const nextCohortsByCourse = new Map<string, PublicCohortDto[]>();
  for (const c of cohorts) {
    const list = nextCohortsByCourse.get(c.courseId) ?? [];
    list.push({ id: c.id, startDate: c.startDate.toISOString() });
    nextCohortsByCourse.set(c.courseId, list);
  }

  return courses.map((c) => ({
    id: c.id,
    name: c.name,
    description: c.description,
    nextCohorts: nextCohortsByCourse.get(c.id) ?? [],
  }));
}

export type PublicCourseDetailDto = {
  id: string;
  name: string;
  description: string | null;
  syllabusUrl: string | null;
  nextCohorts: PublicCohortDto[];
};

/**
 * 005 (T041, FR-020/FR-021/FR-022) — un curso puntual, con las camadas
 * futuras. `syllabusUrl` se toma de la primera camada futura que lo
 * declare; null si ninguna lo hace (contracts/public-courses.md).
 */
export async function getPublicCourse(courseId: string): Promise<PublicCourseDetailDto | null> {
  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) return null;

  const db = getDb();
  const courseRows = await db
    .select({ id: schema.course.id, name: schema.course.name, description: schema.course.description })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .limit(1);
  const course = courseRows[0];
  if (!course) return null;

  const cohortRows = await db
    .select({
      id: schema.cohort.id,
      startDate: schema.cohort.startDate,
      syllabusUrl: schema.cohort.syllabusUrl,
    })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        eq(schema.cohort.courseId, courseId),
        gt(schema.cohort.startDate, new Date())
      )
    )
    .orderBy(asc(schema.cohort.startDate));

  const syllabusUrl = cohortRows.find((c) => c.syllabusUrl)?.syllabusUrl ?? null;

  return {
    id: course.id,
    name: course.name,
    description: course.description,
    syllabusUrl,
    nextCohorts: cohortRows.map((c) => ({ id: c.id, startDate: c.startDate.toISOString() })),
  };
}
