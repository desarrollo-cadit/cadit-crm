import { asc, eq, like, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema, type DbOrTx } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import type { CourseCategoryDto } from "@/lib/types";
import { slugify } from "@/lib/utils";

/**
 * 006 — Categorías del catálogo y temario estructurado del curso. Viven acá y
 * no en `courses.ts` porque son entidades propias con su propio CRUD; ese
 * archivo ya concentra cursos + cohortes.
 *
 * Ninguna de estas superficies es pública por sí misma: el sitio comercial las
 * consume ya resueltas dentro del DTO de `/api/public/courses` (ver
 * `public-catalog.ts`), no como endpoints sueltos.
 */

/* ============================================================
 * Categorías
 * ============================================================ */

// Definido en `@/lib/types` (lo comparten server y cliente); se re-exporta acá
// para no duplicar la forma en dos archivos que después divergen.
export type { CourseCategoryDto } from "@/lib/types";

async function resolveUniqueCategorySlug(
  db: ReturnType<typeof getDb>,
  organizationId: string,
  desired: string,
  excludeId?: string
): Promise<string> {
  const base = slugify(desired);
  const rows = await db
    .select({ slug: schema.courseCategory.slug })
    .from(schema.courseCategory)
    .where(
      scoped(
        schema.courseCategory.organizationId,
        organizationId,
        like(schema.courseCategory.slug, `${base}%`),
        excludeId ? ne(schema.courseCategory.id, excludeId) : undefined
      )
    );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export async function listCourseCategories(
  organizationId: string
): Promise<CourseCategoryDto[]> {
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

export async function createCourseCategory(
  organizationId: string,
  input: { name: string; slug?: string }
): Promise<CourseCategoryDto> {
  const db = getDb();
  const id = newId("courseCategory");
  const slug = await resolveUniqueCategorySlug(
    db,
    organizationId,
    input.slug?.trim() || input.name
  );
  await db.insert(schema.courseCategory).values({
    id,
    organizationId,
    name: input.name,
    slug,
  });
  return { id, name: input.name, slug };
}

export async function updateCourseCategory(
  organizationId: string,
  categoryId: string,
  input: { name?: string; slug?: string }
): Promise<CourseCategoryDto | null> {
  const db = getDb();
  const slug =
    input.slug !== undefined
      ? await resolveUniqueCategorySlug(db, organizationId, input.slug, categoryId)
      : undefined;

  const rows = await db
    .update(schema.courseCategory)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(slug !== undefined ? { slug } : {}),
      updatedAt: new Date(),
    })
    .where(
      scoped(
        schema.courseCategory.organizationId,
        organizationId,
        eq(schema.courseCategory.id, categoryId)
      )
    )
    .returning({
      id: schema.courseCategory.id,
      name: schema.courseCategory.name,
      slug: schema.courseCategory.slug,
    });
  return rows[0] ?? null;
}

/**
 * Borra una categoría. Los cursos que la usaban quedan sin categoría
 * (`ON DELETE SET NULL` en el schema) en vez de bloquear el borrado: una
 * categoría mal creada tiene que poder eliminarse sin tener que reasignar
 * antes todos sus cursos.
 */
export async function deleteCourseCategory(
  organizationId: string,
  categoryId: string
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .delete(schema.courseCategory)
    .where(
      scoped(
        schema.courseCategory.organizationId,
        organizationId,
        eq(schema.courseCategory.id, categoryId)
      )
    )
    .returning({ id: schema.courseCategory.id });
  return rows.length > 0;
}

/* ============================================================
 * Temario estructurado
 * ============================================================ */

export type CourseModuleDto = { id: string; title: string; topics: string[] };
export type CourseModuleInput = { title: string; topics: string[] };

/**
 * Validación del temario, compartida por el POST y el PATCH de `/api/courses`:
 * si solo la declarara el PATCH, Zod descartaría en silencio el temario que se
 * carga al CREAR un curso y el usuario perdería lo que escribió sin ningún
 * error.
 */
export const courseModulesSchema = z
  .array(
    z.object({
      title: z.string().trim().min(1).max(200),
      topics: z.array(z.string().trim().min(1).max(300)).max(50),
    })
  )
  .max(60);

export async function listCourseModules(
  organizationId: string,
  courseId: string
): Promise<CourseModuleDto[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.courseModule.id,
      title: schema.courseModule.title,
      topics: schema.courseModule.topics,
    })
    .from(schema.courseModule)
    .where(
      scoped(
        schema.courseModule.organizationId,
        organizationId,
        eq(schema.courseModule.courseId, courseId)
      )
    )
    .orderBy(asc(schema.courseModule.position));
  return rows.map((r) => ({ id: r.id, title: r.title, topics: r.topics ?? [] }));
}

export type ReplaceModulesResult =
  | { ok: true; modules: CourseModuleDto[] }
  | { ok: false; status: 404; code: "not_found"; message: string };


/**
 * Reemplaza el temario completo del curso. Se guarda entero y no módulo por
 * módulo porque el editor del CRM manipula la lista como un todo (agregar,
 * borrar y reordenar en la misma pantalla): así el orden que ve el usuario es
 * exactamente el que persiste, sin estados intermedios con posiciones
 * duplicadas. `position` se reasigna contiguo desde 0 en cada guardado, para
 * que el sitio comercial pueda ordenar por ese campo sin huecos.
 */
export async function replaceCourseModules(
  organizationId: string,
  courseId: string,
  modules: CourseModuleInput[]
): Promise<ReplaceModulesResult> {
  const db = getDb();

  const courseRows = await db
    .select({ id: schema.course.id })
    .from(schema.course)
    .where(
      scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId))
    )
    .limit(1);
  if (!courseRows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Curso no encontrado" };
  }

  const written = await db.transaction((tx) =>
    writeCourseModules(organizationId, courseId, modules, tx)
  );
  return { ok: true, modules: written };
}

/**
 * Escritura pura del temario, SIN verificar que el curso exista: la usan
 * `createCourseWithModules`/`updateCourseWithModules`, que acaban de crear o
 * actualizar ese mismo curso dentro de la misma transacción y ya probaron que
 * pertenece a la organización.
 *
 * Existe separada de `replaceCourseModules` para no tener que manejar —ni
 * fingir que se maneja— un "curso inexistente" que ahí es imposible: devolver
 * un error desde adentro de `db.transaction()` NO revierte nada (drizzle solo
 * revierte si algo lanza), así que esa rama habría commiteado el curso y
 * respondido 404.
 *
 * El borrado y el alta van en la misma transacción porque el reemplazo total es
 * justamente el caso donde perder el estado intermedio es destructivo: sin eso,
 * un fallo entre ambos pasos deja al curso sin temario y sin nada que lo
 * reponga.
 */
export async function writeCourseModules(
  organizationId: string,
  courseId: string,
  modules: CourseModuleInput[],
  tx: DbOrTx
): Promise<CourseModuleDto[]> {
  const rows = modules.map((m, position) => ({
    id: newId("courseModule"),
    organizationId,
    courseId,
    position,
    title: m.title,
    topics: m.topics,
  }));

  await tx
    .delete(schema.courseModule)
    .where(
      scoped(
        schema.courseModule.organizationId,
        organizationId,
        eq(schema.courseModule.courseId, courseId)
      )
    );
  if (rows.length > 0) await tx.insert(schema.courseModule).values(rows);

  return rows.map((r) => ({ id: r.id, title: r.title, topics: r.topics }));
}
