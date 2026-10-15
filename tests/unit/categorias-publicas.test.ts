import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Una categoría sin cursos publicados no sale en el filtro del sitio: llevaría
 * a una página vacía. Y el CRM tiene que poder borrarla.
 */
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("categorías del catálogo", () => {
  it("el sitio solo recibe categorías con algún curso publicado", () => {
    const src = read("src/server/public-catalog.ts");
    const fn = src.slice(src.indexOf("export async function listPublicCategories"));
    const body = fn.slice(0, fn.indexOf("\n}\n"));
    // 032 (FR-004) — "publicado" ahora es `condicionDeCatalogo()`: publicado
    // y no de tipo módulo. Una categoría con solo módulos tampoco sale.
    expect(body).toContain("condicionDeCatalogo()");
    expect(body).toContain("inArray(schema.courseCategory.id");
  });

  it("el formulario del curso permite eliminar la categoría elegida", () => {
    const src = read("src/components/academic/course-form.tsx");
    expect(src).toMatch(/fetch\(`\/api\/course-categories\/\$\{category\.id\}`,\s*\{\s*method: "DELETE"/);
    expect(src).toContain("onCategoryDeleted(category.id)");
  });
});
