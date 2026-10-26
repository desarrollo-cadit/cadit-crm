import { describe, expect, it } from "vitest";
import { resumenDeDuracion } from "@/lib/course-duration";

/** 2026-10-26 — La duración en una línea, para el listado de Cursos. */
describe("resumenDeDuracion", () => {
  it("total, clases y horas por clase", () => {
    expect(resumenDeDuracion({ classCount: 10, hoursPerClass: 4, totalHours: 40 })).toBe(
      "40 horas · 10 clases de 4 h"
    );
    expect(resumenDeDuracion({ classCount: 15, hoursPerClass: 2.5, totalHours: 37.5 })).toBe(
      "37,5 horas · 15 clases de 2,5 h"
    );
  });

  it("dice solo lo que está cargado", () => {
    expect(resumenDeDuracion({ classCount: null, hoursPerClass: null, totalHours: 4 })).toBe("4 horas");
    expect(resumenDeDuracion({ classCount: 1, hoursPerClass: null, totalHours: null })).toBe("1 clase");
  });

  it("sin nada, null", () => {
    expect(resumenDeDuracion({ classCount: null, hoursPerClass: null, totalHours: null })).toBeNull();
  });
});
