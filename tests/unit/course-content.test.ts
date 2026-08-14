import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 006 — contenido comercial del curso: `slugify` (tiene que coincidir con el
 * backfill SQL de la migración 0014), resolución de slug único por
 * organización, y el temario estructurado (`replaceCourseModules`), que se
 * guarda reasignando posiciones contiguas para que el sitio comercial pueda
 * ordenar por `position` sin huecos.
 */

const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
const deletes: { table: unknown }[] = [];
const selectQueue: unknown[][] = [];
/** Simulan que el `scoped()` no encontró la fila (id de otra organización). */
let updateReturnsEmpty = false;
let deleteReturnsEmpty = false;

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => {
  function makeDb(): Record<string, unknown> {
    return {
      select: () => thenableChain(selectQueue.shift() ?? []),
      insert: (table: unknown) => ({
        values: (values: unknown) => {
          inserts.push({ table, values });
          // `.values()` se usa await-eado y encadenado con `.returning()`
          // (createCourse necesita la fila persistida): soporta las dos formas.
          const result = Promise.resolve([values]) as Promise<unknown[]> & {
            returning?: () => Promise<unknown[]>;
          };
          result.returning = () =>
            Promise.resolve([
              { createdAt: new Date("2026-08-12"), ...(values as object) },
            ]);
          return result;
        },
      }),
      update: (table: unknown) => ({
        set: (set: unknown) => {
          updates.push({ table, set });
          return {
            where: () => ({
              returning: () =>
                Promise.resolve(
                  updateReturnsEmpty ? [] : [{ id: "crs_1", ...(set as object) }]
                ),
            }),
          };
        },
      }),
      delete: (table: unknown) => {
        deletes.push({ table });
        // `.where()` se usa await-eado (borrado del temario) y encadenado con
        // `.returning()` (borrado de categoría): soporta las dos formas.
        const result = Promise.resolve([]) as Promise<unknown[]> & {
          returning?: () => Promise<unknown[]>;
        };
        result.returning = () =>
          Promise.resolve(deleteReturnsEmpty ? [] : [{ id: "cat_1" }]);
        return { where: () => result };
      },
      // `replaceCourseModules` envuelve el borrado + alta en una transacción
      // para no dejar el curso sin temario si falla en el medio; el mock corre
      // el callback con el mismo db falso.
      transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(makeDb()),
    };
  }

  return {
    getDb: makeDb,
    schema: new Proxy(
      {},
      {
        get: (_t, tableName) =>
          new Proxy(
            {},
            { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
          ),
      }
    ),
  };
});

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  deletes.length = 0;
  selectQueue.length = 0;
  updateReturnsEmpty = false;
  deleteReturnsEmpty = false;
});

describe("slugify (006)", () => {
  it("baja a minúsculas y une palabras con guiones", async () => {
    const { slugify } = await import("@/lib/utils");
    expect(slugify("Revit Arquitectura")).toBe("revit-arquitectura");
  });

  it("plancha acentos y ñ igual que el backfill SQL de 0014", async () => {
    const { slugify } = await import("@/lib/utils");
    expect(slugify("Diseño Gráfico Avanzado")).toBe("diseno-grafico-avanzado");
  });

  it("colapsa símbolos y espacios repetidos en un solo guión, sin guiones en los bordes", async () => {
    const { slugify } = await import("@/lib/utils");
    expect(slugify("IA & Automatización")).toBe("ia-automatizacion");
    expect(slugify("Revit  —  Nivel 2")).toBe("revit-nivel-2");
  });

  it("un nombre sin caracteres utilizables cae al literal 'curso' (mismo fallback que 0014)", async () => {
    const { slugify } = await import("@/lib/utils");
    expect(slugify("###")).toBe("curso");
  });
});

describe("createCourse — slug (006)", () => {
  it("deriva el slug del nombre cuando no se pasa uno", async () => {
    selectQueue.push([]); // ningún slug ocupado

    const { createCourse } = await import("@/server/courses");
    await createCourse("org_1", { name: "Revit Arquitectura" });

    const values = inserts[0]!.values as { slug: string; organizationId: string };
    expect(values.slug).toBe("revit-arquitectura");
    expect(values.organizationId).toBe("org_1");
  });

  it("respeta el slug explícito del usuario, normalizándolo", async () => {
    selectQueue.push([]);

    const { createCourse } = await import("@/server/courses");
    await createCourse("org_1", { name: "Revit Arquitectura", slug: "Revit AI" });

    expect((inserts[0]!.values as { slug: string }).slug).toBe("revit-ai");
  });

  it("ante un slug ya ocupado en la organización, sufija hasta encontrar uno libre", async () => {
    selectQueue.push([{ slug: "revit" }, { slug: "revit-2" }]);

    const { createCourse } = await import("@/server/courses");
    await createCourse("org_1", { name: "Revit" });

    expect((inserts[0]!.values as { slug: string }).slug).toBe("revit-3");
  });

  it("rechaza una categoría de otra organización → 422, sin insertar (hallazgo del reviewer)", async () => {
    selectQueue.push([]); // validateCategory: la categoría no existe en esta org

    const { createCourse } = await import("@/server/courses");
    const result = await createCourse("org_1", {
      name: "Curso",
      categoryId: "cat_de_otra_org",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería haber aceptado la categoría ajena");
    expect(result.status).toBe(422);
    expect(inserts).toHaveLength(0);
  });

  it("guarda los campos de contenido comercial", async () => {
    selectQueue.push([]);

    const { createCourse } = await import("@/server/courses");
    await createCourse("org_1", {
      name: "IA Automation",
      tagline: "Automatizá tu negocio con IA",
      level: "inicial",
      modality: "en_vivo",
      durationWeeks: 12,
      hoursPerWeek: 4,
      learningObjectives: ["Armar agentes", "Conectar APIs"],
      targetAudience: "Sin conocimientos previos de programación",
      syllabusUrl: "https://example.com/temario.pdf",
    });

    const values = inserts[0]!.values as Record<string, unknown>;
    expect(values.tagline).toBe("Automatizá tu negocio con IA");
    expect(values.level).toBe("inicial");
    expect(values.modality).toBe("en_vivo");
    expect(values.durationWeeks).toBe(12);
    expect(values.hoursPerWeek).toBe(4);
    expect(values.learningObjectives).toEqual(["Armar agentes", "Conectar APIs"]);
    expect(values.targetAudience).toBe("Sin conocimientos previos de programación");
    expect(values.syllabusUrl).toBe("https://example.com/temario.pdf");
  });
});

describe("replaceCourseModules — temario estructurado (006)", () => {
  it("curso inexistente en la organización → 404, sin borrar ni insertar nada", async () => {
    selectQueue.push([]); // el curso no existe en esta organización

    const { replaceCourseModules } = await import("@/server/course-content");
    const result = await replaceCourseModules("org_1", "crs_ajeno", [
      { title: "Módulo 1", topics: ["Tema"] },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería haber aceptado el curso ajeno");
    expect(result.status).toBe(404);
    expect(deletes).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("reasigna posiciones contiguas desde 0 respetando el orden recibido", async () => {
    selectQueue.push([{ id: "crs_1" }]);

    const { replaceCourseModules } = await import("@/server/course-content");
    const result = await replaceCourseModules("org_1", "crs_1", [
      { title: "Fundamentos", topics: ["Qué es un agente", "Modelos"] },
      { title: "Práctica", topics: ["Primer flujo"] },
    ]);

    expect(result.ok).toBe(true);
    const values = inserts[0]!.values as {
      courseId: string;
      organizationId: string;
      position: number;
      title: string;
      topics: string[];
    }[];
    expect(values.map((m) => m.position)).toEqual([0, 1]);
    expect(values.map((m) => m.title)).toEqual(["Fundamentos", "Práctica"]);
    expect(values[0]!.topics).toEqual(["Qué es un agente", "Modelos"]);
    expect(values.every((m) => m.organizationId === "org_1")).toBe(true);
    expect(values.every((m) => m.courseId === "crs_1")).toBe(true);
  });

  it("lista vacía borra el temario sin insertar filas", async () => {
    selectQueue.push([{ id: "crs_1" }]);

    const { replaceCourseModules } = await import("@/server/course-content");
    const result = await replaceCourseModules("org_1", "crs_1", []);

    expect(result.ok).toBe(true);
    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });
});

describe("createCourseCategory (006)", () => {
  it("deriva el slug del nombre y guarda scoped a la organización", async () => {
    selectQueue.push([]);

    const { createCourseCategory } = await import("@/server/course-content");
    await createCourseCategory("org_1", { name: "Inteligencia Artificial" });

    const values = inserts[0]!.values as { slug: string; organizationId: string; name: string };
    expect(values.slug).toBe("inteligencia-artificial");
    expect(values.organizationId).toBe("org_1");
    expect(values.name).toBe("Inteligencia Artificial");
  });

  it("sufija el slug si la categoría ya existe en la organización", async () => {
    selectQueue.push([{ slug: "diseno" }]);

    const { createCourseCategory } = await import("@/server/course-content");
    await createCourseCategory("org_1", { name: "Diseño" });

    expect((inserts[0]!.values as { slug: string }).slug).toBe("diseno-2");
  });
});

describe("createCourseWithModules / updateCourseWithModules (006)", () => {
  it("el alta con temario crea curso y módulos en la misma transacción", async () => {
    selectQueue.push([]); // slug libre
    selectQueue.push([{ id: "crs_1" }]); // replaceCourseModules: el curso existe

    const { createCourseWithModules } = await import("@/server/courses");
    const result = await createCourseWithModules(
      "org_1",
      { name: "Curso Nuevo" },
      [{ title: "Módulo 1", topics: ["Tema"] }]
    );

    expect(result.ok).toBe(true);
    // curso + módulos
    expect(inserts).toHaveLength(2);
    const modulesInserted = inserts[1]!.values as { title: string; position: number }[];
    expect(modulesInserted[0]!.title).toBe("Módulo 1");
    expect(modulesInserted[0]!.position).toBe(0);
  });

  it("el alta sin temario no toca course_module", async () => {
    selectQueue.push([]); // slug libre

    const { createCourseWithModules } = await import("@/server/courses");
    const result = await createCourseWithModules("org_1", { name: "Curso Pelado" });

    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1); // solo el curso
    expect(deletes).toHaveLength(0);
  });

  it("si el curso no valida, no se escribe ningún módulo", async () => {
    selectQueue.push([]); // validateCategory: categoría ajena → no encontrada

    const { createCourseWithModules } = await import("@/server/courses");
    const result = await createCourseWithModules(
      "org_1",
      { name: "Curso", categoryId: "cat_ajena" },
      [{ title: "Módulo 1", topics: [] }]
    );

    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(0);
    expect(deletes).toHaveLength(0);
  });

  it("la edición sin `modules` deja el temario intacto (no lo borra)", async () => {
    const { updateCourseWithModules } = await import("@/server/courses");
    const result = await updateCourseWithModules("org_1", "crs_1", { name: "Otro" });

    expect(result.ok).toBe(true);
    // Sin `modules` no se dispara el reemplazo: ni DELETE ni INSERT.
    expect(deletes).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("la edición con `modules: []` sí borra el temario", async () => {
    selectQueue.push([{ id: "crs_1" }]); // replaceCourseModules: el curso existe

    const { updateCourseWithModules } = await import("@/server/courses");
    const result = await updateCourseWithModules("org_1", "crs_1", {}, []);

    expect(result.ok).toBe(true);
    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });

  it("curso inexistente → 404, sin tocar el temario", async () => {
    updateReturnsEmpty = true;

    const { updateCourseWithModules } = await import("@/server/courses");
    const result = await updateCourseWithModules("org_1", "crs_ajeno", { name: "X" }, [
      { title: "M", topics: [] },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería haber actualizado un curso ajeno");
    expect(result.status).toBe(404);
    expect(deletes).toHaveLength(0);
  });
});

describe("courseModulesSchema (006)", () => {
  it("acepta el temario del alta — sin esto el POST lo descartaba en silencio", async () => {
    const { courseModulesSchema } = await import("@/server/course-content");
    const parsed = courseModulesSchema.safeParse([
      { title: "Módulo 1", topics: ["Tema A", "Tema B"] },
    ]);
    expect(parsed.success).toBe(true);
  });

  it("rechaza un módulo sin título", async () => {
    const { courseModulesSchema } = await import("@/server/course-content");
    expect(courseModulesSchema.safeParse([{ title: "  ", topics: [] }]).success).toBe(false);
  });

  it("un temario vacío es válido (borra el temario)", async () => {
    const { courseModulesSchema } = await import("@/server/course-content");
    expect(courseModulesSchema.safeParse([]).success).toBe(true);
  });
});

describe("updateCourseCategory / deleteCourseCategory (006)", () => {
  it("renombrar sin tocar el slug no dispara la resolución de slug", async () => {
    const { updateCourseCategory } = await import("@/server/course-content");
    const result = await updateCourseCategory("org_1", "cat_1", { name: "IA aplicada" });

    expect(result?.name).toBe("IA aplicada");
    expect(updates).toHaveLength(1);
    expect(updates[0]!.set).not.toHaveProperty("slug");
    // Sin `slug` en el input no hace falta consultar los ocupados.
    expect(selectQueue).toHaveLength(0);
  });

  it("al cambiar el slug se excluye a sí misma, así re-guardar el mismo no lo sufija", async () => {
    // La query ya excluye la propia fila por SQL (`ne`), así que el slug actual
    // no aparece entre los ocupados.
    selectQueue.push([]);

    const { updateCourseCategory } = await import("@/server/course-content");
    await updateCourseCategory("org_1", "cat_1", { slug: "diseno" });

    expect((updates[0]!.set as { slug: string }).slug).toBe("diseno");
  });

  it("categoría de otra organización → null (el scope no la encuentra)", async () => {
    const { updateCourseCategory } = await import("@/server/course-content");
    updateReturnsEmpty = true;

    const result = await updateCourseCategory("org_1", "cat_ajena", { name: "X" });

    expect(result).toBeNull();
  });

  it("borrar una categoría ajena devuelve false, sin afectar filas", async () => {
    deleteReturnsEmpty = true;

    const { deleteCourseCategory } = await import("@/server/course-content");
    expect(await deleteCourseCategory("org_1", "cat_ajena")).toBe(false);
  });

  it("borrar una categoría propia devuelve true", async () => {
    const { deleteCourseCategory } = await import("@/server/course-content");
    expect(await deleteCourseCategory("org_1", "cat_1")).toBe(true);
  });
});
