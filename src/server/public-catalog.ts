import { and, asc, eq, gt, inArray, or } from "drizzle-orm";
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

export type PublicCategoryDto = { id: string; name: string; slug: string };

/**
 * 006 — Campos de la ficha comercial compartidos por el listado y el detalle.
 * El sitio comercial arma con esto la tarjeta del catálogo; el detalle agrega
 * el cuerpo largo y el temario.
 */
export type PublicCourseDto = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  imageUrl: string | null;
  category: PublicCategoryDto | null;
  level: string | null;
  modality: string | null;
  durationWeeks: number | null;
  hoursPerWeek: number | null;
  nextCohorts: PublicCohortDto[];
};

export type PublicCourseModuleDto = { title: string; topics: string[] };

export type PublicCourseDetailDto = PublicCourseDto & {
  description: string | null;
  learningObjectives: string[];
  targetAudience: string | null;
  syllabusUrl: string | null;
  /** Temario estructurado, en orden de cursada. */
  modules: PublicCourseModuleDto[];
};

/** Columnas de la ficha comercial; nunca incluye datos de alumnos (FR-022). */
const publicCourseColumns = {
  id: schema.course.id,
  slug: schema.course.slug,
  name: schema.course.name,
  tagline: schema.course.tagline,
  description: schema.course.description,
  imageUrl: schema.course.imageUrl,
  level: schema.course.level,
  modality: schema.course.modality,
  durationWeeks: schema.course.durationWeeks,
  hoursPerWeek: schema.course.hoursPerWeek,
  learningObjectives: schema.course.learningObjectives,
  targetAudience: schema.course.targetAudience,
  syllabusUrl: schema.course.syllabusUrl,
  categoryId: schema.courseCategory.id,
  categoryName: schema.courseCategory.name,
  categorySlug: schema.courseCategory.slug,
};

/**
 * Forma de una fila de `publicCourseColumns`. Se declara estructuralmente (y
 * no con un `as` sobre el resultado) para que un cambio de schema que deje de
 * matchear rompa en typecheck en vez de en runtime.
 */
type PublicCourseRow = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  imageUrl: string | null;
  level: string | null;
  modality: string | null;
  durationWeeks: number | null;
  hoursPerWeek: number | null;
  learningObjectives: string[] | null;
  targetAudience: string | null;
  syllabusUrl: string | null;
  categoryId: string | null;
  categoryName: string | null;
  categorySlug: string | null;
};

/**
 * Condición del join con la categoría. Lleva `organization_id` explícito
 * ADEMÁS del match por FK: el `where` scopea el curso, pero sin esto la
 * categoría se resuelve contra cualquier organización, así que un curso
 * apuntado (por error o a propósito) a una categoría ajena filtra su nombre y
 * su slug al endpoint público.
 */
function categoryJoinFor(organizationId: string) {
  return and(
    eq(schema.course.categoryId, schema.courseCategory.id),
    eq(schema.courseCategory.organizationId, organizationId)
  );
}

function toCategory(row: PublicCourseRow): PublicCategoryDto | null {
  if (!row.categoryId || !row.categoryName || !row.categorySlug) return null;
  return { id: row.categoryId, name: row.categoryName, slug: row.categorySlug };
}

function toPublicCourse(row: PublicCourseRow, nextCohorts: PublicCohortDto[]): PublicCourseDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    imageUrl: row.imageUrl,
    category: toCategory(row),
    level: row.level,
    modality: row.modality,
    durationWeeks: row.durationWeeks,
    hoursPerWeek: row.hoursPerWeek,
    nextCohorts,
  };
}

/** Camadas futuras agrupadas por curso — `start_date > now()` (FR-021). */
async function nextCohortsByCourse(
  db: ReturnType<typeof getDb>,
  organizationId: string,
  courseIds?: string[]
): Promise<Map<string, PublicCohortDto[]>> {
  const map = new Map<string, PublicCohortDto[]>();
  if (courseIds && courseIds.length === 0) return map;

  const rows = await db
    .select({
      id: schema.cohort.id,
      courseId: schema.cohort.courseId,
      startDate: schema.cohort.startDate,
    })
    .from(schema.cohort)
    .where(
      scoped(
        schema.cohort.organizationId,
        organizationId,
        gt(schema.cohort.startDate, new Date()),
        courseIds ? inArray(schema.cohort.courseId, courseIds) : undefined
      )
    )
    .orderBy(asc(schema.cohort.startDate));

  for (const c of rows) {
    const list = map.get(c.courseId) ?? [];
    list.push({ id: c.id, startDate: c.startDate.toISOString() });
    map.set(c.courseId, list);
  }
  return map;
}

/** 006 — Categorías del catálogo, para el filtro del sitio comercial. */
export async function listPublicCategories(): Promise<PublicCategoryDto[]> {
  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) return [];

  const db = getDb();
  return db
    .select({
      id: schema.courseCategory.id,
      name: schema.courseCategory.name,
      slug: schema.courseCategory.slug,
    })
    .from(schema.courseCategory)
    .where(scoped(schema.courseCategory.organizationId, organizationId))
    .orderBy(asc(schema.courseCategory.name));
}

/**
 * 005 (T041, FR-020/FR-021/FR-022) — catálogo público. 006 lo amplía con la
 * ficha comercial (tagline, imagen, categoría, nivel, modalidad, duración)
 * para que el sitio externo pueda armar las tarjetas del catálogo sin una
 * segunda llamada por curso. Nunca toca `contact`/`enrollment`/`license`
 * (FR-022).
 */
export async function listPublicCourses(filter?: {
  categorySlug?: string;
}): Promise<PublicCourseDto[]> {
  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) return [];

  const db = getDb();
  const courses: PublicCourseRow[] = await db
    .select(publicCourseColumns)
    .from(schema.course)
    .leftJoin(schema.courseCategory, categoryJoinFor(organizationId))
    .where(
      scoped(
        schema.course.organizationId,
        organizationId,
        filter?.categorySlug ? eq(schema.courseCategory.slug, filter.categorySlug) : undefined
      )
    )
    .orderBy(asc(schema.course.name));

  const cohorts = await nextCohortsByCourse(
    db,
    organizationId,
    courses.map((c) => c.id)
  );

  return courses.map((c) => toPublicCourse(c, cohorts.get(c.id) ?? []));
}

/**
 * 005 (T041) / 006 — un curso puntual con su ficha completa y su temario.
 * Acepta el `slug` público (`/cursos/ai-automation`) o el id interno: el sitio
 * comercial usa el slug en sus URLs, pero los enlaces ya publicados con id
 * tienen que seguir resolviendo.
 */
export async function getPublicCourse(
  idOrSlug: string
): Promise<PublicCourseDetailDto | null> {
  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) return null;

  const db = getDb();
  const rows: PublicCourseRow[] = await db
    .select(publicCourseColumns)
    .from(schema.course)
    .leftJoin(schema.courseCategory, categoryJoinFor(organizationId))
    .where(
      scoped(
        schema.course.organizationId,
        organizationId,
        or(eq(schema.course.slug, idOrSlug), eq(schema.course.id, idOrSlug))
      )
    )
    .limit(1);
  const course = rows[0];
  if (!course) return null;

  const [cohorts, modules] = await Promise.all([
    nextCohortsByCourse(db, organizationId, [course.id]),
    db
      .select({
        title: schema.courseModule.title,
        topics: schema.courseModule.topics,
      })
      .from(schema.courseModule)
      .where(
        scoped(
          schema.courseModule.organizationId,
          organizationId,
          eq(schema.courseModule.courseId, course.id)
        )
      )
      .orderBy(asc(schema.courseModule.position)),
  ]);

  return {
    ...toPublicCourse(course, cohorts.get(course.id) ?? []),
    description: course.description,
    learningObjectives: course.learningObjectives ?? [],
    targetAudience: course.targetAudience,
    syllabusUrl: course.syllabusUrl,
    modules: modules.map((m) => ({ title: m.title, topics: m.topics ?? [] })),
  };
}
