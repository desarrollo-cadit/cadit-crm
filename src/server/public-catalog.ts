import { and, asc, eq, gt, inArray, ne, or, type SQL } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { horasDesdeDb } from "@/lib/course-duration";

/**
 * 032 (FR-004) — Qué cursos salen en las puertas públicas: los publicados
 * (007) que NO son de tipo módulo. Un módulo es una etapa de una
 * especialización, no un producto que la academia vende suelto, así que no
 * aparece aunque alguien le deje tildado "publicar".
 *
 * Es la versión SQL de `apareceEnCatalogo()` (`lib/course-kind.ts`) y la usan
 * todas las puertas: listado, detalle, categorías y la captación por curso.
 * Escribir `published = true` suelto en una de ellas la dejaría mostrando
 * módulos; hay un test que lo prohíbe.
 */
export function condicionDeCatalogo(): SQL {
  return and(eq(schema.course.published, true), ne(schema.course.kind, "modulo"))!;
}

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

/**
 * 023 — La cohorte pública lleva a QUIÉN la dicta.
 *
 * Pedido del dueño: *"así puedo tomar de la cohorte que muestro en la web, esa
 * imagen y título para que vean quién dicta esa cohorte"*.
 *
 * Solo nombre, título y foto. **Nunca el correo ni la tarifa**: el catálogo es
 * público y esos dos son datos internos del profesor.
 */
export type PublicTeacherDto = {
  name: string;
  /** "Arquitecto", "Ingeniero Civil". `null` si no se cargó. */
  title: string | null;
  /** URL de la foto, o `null`. El sitio la usa tal cual. */
  photoUrl: string | null;
};

/**
 * 2026-10-27 — Pedido del dueño: la web muestra cuándo y a qué hora se cursa.
 * Días y horario son datos comerciales del grupo (los mismos que ve quien se
 * anota). La fecha de FIN no sale, por decisión del dueño; tampoco cupo, aula,
 * precio ni nada de alumnos.
 */
export type PublicCohortDto = {
  id: string;
  /** Día de calendario a medianoche UTC (ISO 8601): leerlo en UTC. */
  startDate: string;
  /**
   * ISO 8601: 1 = lunes … 7 = domingo, ordenados. NO es el 0–6 interno de
   * `cohort.days_of_week` (0 = lunes) ni el de `Date.getDay()` (0 = domingo):
   * un contrato público con un 0 ambiguo termina mostrando el día equivocado.
   */
  daysOfWeek: number[];
  /** "HH:MM" en `timeZone`; `null` si no se cargó. */
  startTime: string | null;
  endTime: string | null;
  /** Zona IANA de la academia: el horario se cursa en esta zona. */
  timeZone: string;
  teacher: PublicTeacherDto | null;
};

/** CSV interno (0 = lunes) → días ISO (1 = lunes), sin basura ni repetidos. */
function diasIso(csv: string | null): number[] {
  const dias = (csv ?? "")
    .split(",")
    .map((d) => d.trim())
    .filter((d) => /^[0-6]$/.test(d))
    .map((d) => Number(d) + 1);
  return [...new Set(dias)].sort((a, b) => a - b);
}

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
  /**
   * Duración del curso, en HORAS (unidades mayores; no es plata): números con
   * decimales, p. ej. `hoursPerClass: 2.5`, `totalHours: 37.5`.
   */
  classCount: number | null;
  hoursPerClass: number | null;
  totalHours: number | null;
  /**
   * DEPRECADOS (0075): lo guardado antes de pasar a clases/horas, de solo
   * lectura, para que la web no se rompa mientras migra a `totalHours`. El
   * CRM ya no los edita; se quitan cuando la web deje de leerlos.
   */
  durationWeeks: number | null;
  /** DEPRECADO (0075) — ver `durationWeeks`. */
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
  classCount: schema.course.classCount,
  hoursPerClass: schema.course.hoursPerClass,
  totalHours: schema.course.totalHours,
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
  classCount: number | null;
  /** `numeric` de Postgres: llega como texto. */
  hoursPerClass: string | null;
  totalHours: string | null;
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
    classCount: row.classCount,
    hoursPerClass: horasDesdeDb(row.hoursPerClass),
    totalHours: horasDesdeDb(row.totalHours),
    durationWeeks: row.durationWeeks,
    hoursPerWeek: row.hoursPerWeek,
    nextCohorts,
  };
}

/** Cohortes futuras agrupadas por curso — `start_date > now()` (FR-021). */
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
      daysOfWeek: schema.cohort.daysOfWeek,
      startTime: schema.cohort.startTime,
      endTime: schema.cohort.endTime,
      timeZone: schema.organization.timezone,
      teacherId: schema.teacher.id,
      teacherName: schema.teacher.name,
      teacherTitle: schema.teacher.title,
      teacherPhoto: schema.teacher.photoMimeType,
    })
    .from(schema.cohort)
    // Con `organization_id` además de la FK, por lo mismo que `categoryJoinFor`:
    // un profesor ajeno no publica su nombre ni su foto.
    .leftJoin(
      schema.teacher,
      and(
        eq(schema.cohort.teacherId, schema.teacher.id),
        eq(schema.teacher.organizationId, organizationId)
      )
    )
    .leftJoin(schema.organization, eq(schema.organization.id, schema.cohort.organizationId))
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
    list.push({
      id: c.id,
      startDate: c.startDate.toISOString(),
      daysOfWeek: diasIso(c.daysOfWeek ?? null),
      startTime: c.startTime ?? null,
      endTime: c.endTime ?? null,
      // Mismo respaldo que `organizationTimezone`.
      timeZone: c.timeZone ?? "America/Montevideo",
      teacher: c.teacherId
        ? {
            name: c.teacherName ?? "",
            title: c.teacherTitle ?? null,
            /**
             * La URL se arma SOLO si hay foto. Devolver siempre el enlace
             * dejaría al sitio comercial pidiendo una imagen que no existe
             * y mostrando el ícono de rota.
             */
            photoUrl: c.teacherPhoto
              ? `/api/teachers/${c.teacherId}/photo`
              : null,
          }
        : null,
    });
    map.set(c.courseId, list);
  }
  return map;
}

/**
 * 006 — Categorías del catálogo, para el filtro del sitio comercial.
 *
 * Solo las que tienen al menos un curso PUBLICADO: una categoría vacía (o con
 * cursos que no salen en la web) en el filtro lleva a una página sin cursos.
 */
export async function listPublicCategories(): Promise<PublicCategoryDto[]> {
  const organizationId = await resolveSoleOrganizationId();
  if (!organizationId) return [];

  const db = getDb();
  const withPublishedCourses = db
    .select({ id: schema.course.categoryId })
    .from(schema.course)
    .where(
      scoped(schema.course.organizationId, organizationId, condicionDeCatalogo())
    );
  return db
    .select({
      id: schema.courseCategory.id,
      name: schema.courseCategory.name,
      slug: schema.courseCategory.slug,
    })
    .from(schema.courseCategory)
    .where(
      scoped(
        schema.courseCategory.organizationId,
        organizationId,
        inArray(schema.courseCategory.id, withPublishedCourses)
      )
    )
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
        // 007 — el catálogo público muestra SOLO los cursos publicados: los
        // talleres a medida y capacitaciones in-company existen en el CRM
        // (con sus cohortes e inscripciones) pero no salen en la web.
        condicionDeCatalogo(),
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
        // 007 — un curso no publicado responde 404 también en el detalle: si
        // no está en el listado, su landing tampoco existe.
        condicionDeCatalogo(),
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
