import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COURSE_KINDS,
  apareceEnCatalogo,
  cursosParaSelector,
  resolverCursoDelAlta,
  validarNombreDeModulo,
} from "@/lib/course-kind";
import { decidirBorradoCurso } from "@/server/courses";

/**
 * 032 — Tipos de curso (curso / módulo / taller), el "Módulo nuevo" desde la
 * especialización y el borrado de cursos. Todo lo que decide se prueba sin
 * base: son reglas puras.
 */

describe("032 (FR-001) — los tipos", () => {
  it("son exactamente curso, módulo y taller", () => {
    expect([...COURSE_KINDS]).toEqual(["curso", "modulo", "taller"]);
  });
});

describe("032 (FR-004) — el catálogo público", () => {
  it("un curso publicado aparece", () => {
    expect(apareceEnCatalogo({ published: true, kind: "curso" })).toBe(true);
    expect(apareceEnCatalogo({ published: true, kind: "taller" })).toBe(true);
  });

  it("un módulo NO aparece aunque esté publicado", () => {
    expect(apareceEnCatalogo({ published: true, kind: "modulo" })).toBe(false);
  });

  it("lo no publicado sigue sin aparecer", () => {
    expect(apareceEnCatalogo({ published: false, kind: "curso" })).toBe(false);
  });

  /**
   * La regla vive en UNA condición SQL (`condicionDeCatalogo`). Si alguien
   * vuelve a escribir `eq(schema.course.published, true)` suelto en una de las
   * puertas públicas, esa puerta deja de excluir a los módulos.
   */
  it("las puertas públicas filtran con la condición compartida, no con `published` suelto", () => {
    for (const f of ["src/server/public-catalog.ts", "src/server/intake-forms.ts"]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      const sueltos = src.match(/eq\(schema\.course\.published,\s*true\)/g) ?? [];
      // public-catalog.ts lo nombra una vez: adentro de la condición misma.
      const permitidos = f.endsWith("public-catalog.ts") ? 1 : 0;
      expect(sueltos.length, `${f} filtra por published sin excluir módulos`).toBe(permitidos);
    }
  });
});

describe("032 (FR-006) — el nombre del módulo nuevo", () => {
  it("recorta los espacios sobrantes", () => {
    expect(validarNombreDeModulo("  Módulo 1 — Fundamentos  ")).toEqual({
      ok: true,
      nombre: "Módulo 1 — Fundamentos",
    });
  });

  it("es obligatorio", () => {
    for (const vacio of ["", "   ", null, undefined]) {
      const r = validarNombreDeModulo(vacio);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/obligatorio/i);
    }
  });

  it("admite hasta 120 caracteres", () => {
    expect(validarNombreDeModulo("a".repeat(120)).ok).toBe(true);
    const largo = validarNombreDeModulo("a".repeat(121));
    expect(largo.ok).toBe(false);
    if (!largo.ok) expect(largo.message).toContain("120");
  });
});

describe("032 (FR-005) — de qué curso cuelga el alta", () => {
  it("curso existente: comportamiento de siempre", () => {
    expect(resolverCursoDelAlta({ courseId: "course_1" })).toEqual({
      ok: true,
      via: "existente",
      courseId: "course_1",
    });
  });

  it("módulo nuevo: solo dentro de una especialización", () => {
    expect(
      resolverCursoDelAlta({ newModuleName: " Módulo 2 ", parentCohortId: "cohort_m" })
    ).toEqual({ ok: true, via: "nuevo", nombre: "Módulo 2" });

    const suelto = resolverCursoDelAlta({ newModuleName: "Módulo 2" });
    expect(suelto.ok).toBe(false);
  });

  it("no se pueden pedir las dos cosas a la vez, ni ninguna", () => {
    expect(
      resolverCursoDelAlta({
        courseId: "course_1",
        newModuleName: "Módulo 2",
        parentCohortId: "cohort_m",
      }).ok
    ).toBe(false);
    expect(resolverCursoDelAlta({}).ok).toBe(false);
  });

  it("módulo nuevo sin nombre no crea nada", () => {
    const r = resolverCursoDelAlta({ newModuleName: "  ", parentCohortId: "cohort_m" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/obligatorio/i);
  });
});

describe("032 — los selectores de curso", () => {
  const cursos = [
    { id: "a", kind: "curso" as const },
    { id: "b", kind: "modulo" as const },
    { id: "c", kind: "taller" as const },
  ];

  it("por defecto no ofrecen módulos", () => {
    expect(cursosParaSelector(cursos).map((c) => c.id)).toEqual(["a", "c"]);
  });

  it("los ofrecen si se pide", () => {
    expect(cursosParaSelector(cursos, { incluirModulos: true }).map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("conservan el ya elegido aunque sea un módulo: editar no lo borra", () => {
    expect(cursosParaSelector(cursos, { seleccionado: "b" }).map((c) => c.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("032 (FR-015/FR-016) — borrar un curso", () => {
  const nada = { cohortes: 0, interesados: 0, formularios: [] as string[] };

  it("un curso sin nada asociado se borra", () => {
    expect(decidirBorradoCurso(nada).accion).toBe("borrar");
  });

  it("con cohortes se bloquea, dice cuántas y sugiere la alternativa", () => {
    const d = decidirBorradoCurso({ ...nada, cohortes: 3 });
    expect(d.accion).toBe("bloquear");
    expect(d.motivo).toContain("3 cohortes");
    expect(d.motivo).toMatch(/tipo/);
    expect(d.motivo).toMatch(/despublic/);
  });

  it("con una sola cohorte, en singular", () => {
    expect(decidirBorradoCurso({ ...nada, cohortes: 1 }).motivo).toContain("1 cohorte");
  });

  it("con interesados se bloquea y dice cuántos", () => {
    const d = decidirBorradoCurso({ ...nada, interesados: 5 });
    expect(d.accion).toBe("bloquear");
    expect(d.motivo).toContain("5 personas");
  });

  it("con un formulario se bloquea y lo nombra", () => {
    const d = decidirBorradoCurso({ ...nada, formularios: ["Landing Revit"] });
    expect(d.accion).toBe("bloquear");
    expect(d.motivo).toContain("Landing Revit");
  });

  it("junta todos los motivos, no solo el primero", () => {
    const d = decidirBorradoCurso({ cohortes: 2, interesados: 1, formularios: ["A", "B"] });
    expect(d.motivo).toContain("2 cohortes");
    expect(d.motivo).toContain("1 persona");
    expect(d.motivo).toContain('"A"');
    expect(d.motivo).toContain('"B"');
  });
});
