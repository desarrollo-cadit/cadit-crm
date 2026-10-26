import { describe, expect, it } from "vitest";
import { colorCategorico, inicialesDeCurso } from "@/lib/cohort-color";
import { cohortColor } from "@/components/calendar/calendar-client";

/**
 * 2026-10-26 — La paleta categórica de cohortes salió del calendario a
 * `src/lib/cohort-color.ts` para que Académico la reuse: el avatar de un curso
 * se pinta con el color que le toca a SU id, siempre el mismo.
 */
describe("colorCategorico", () => {
  it("es estable: la misma clave, el mismo color", () => {
    expect(colorCategorico("crs_revit")).toEqual(colorCategorico("crs_revit"));
  });

  it("el calendario sigue pintando igual (misma función)", () => {
    for (const id of ["coh_a", "coh_b", "coh_zz9"]) {
      expect(cohortColor(id)).toEqual(colorCategorico(id));
    }
  });

  it("devuelve clases de los tokens, nunca colores crudos", () => {
    const c = colorCategorico("crs_x");
    expect(c.bg).toMatch(/^bg-cohort-[1-8]$/);
    expect(c.text).toMatch(/^text-cohort-[1-8]-fg$/);
  });

  it("reparte entre los ocho pares", () => {
    const usados = new Set(
      Array.from({ length: 80 }, (_, i) => colorCategorico(`crs_${i}`).bg)
    );
    expect(usados.size).toBe(8);
  });
});

describe("inicialesDeCurso", () => {
  it("dos iniciales, sin conectores", () => {
    expect(inicialesDeCurso("Revit Arquitectura")).toBe("RA");
    expect(inicialesDeCurso("Dynamo para Revit")).toBe("DR");
    expect(inicialesDeCurso("Especialización en BIM")).toBe("EB");
    expect(inicialesDeCurso("AutoCAD 2D")).toBe("A2");
  });

  it("una sola palabra: sus dos primeras letras", () => {
    expect(inicialesDeCurso("Rhino")).toBe("RH");
  });

  it("nunca vacío", () => {
    expect(inicialesDeCurso("")).toBe("?");
    expect(inicialesDeCurso("  de la  ")).toBe("?");
  });
});
