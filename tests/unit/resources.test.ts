import { describe, expect, it } from "vitest";
import { validateResource } from "@/server/resources";

/**
 * 013 (T020, FR-006/FR-007) — Dónde puede colgar un material, y qué es un
 * enlace válido.
 *
 * La regla del contenedor la impone también el CHECK
 * `resource_contenedor_unico` en Postgres. Se valida antes para que el usuario
 * lea un 422 que dice qué pasó, en vez del 500 opaco de un constraint violado
 * — mismo criterio que `validateAccountLink` en 012.
 */

const base = { title: "Guía de Revit", url: "https://drive.google.com/guia" };

describe("validateResource — un curso O una clase, nunca los dos", () => {
  it("acepta material de un curso", () => {
    expect(validateResource({ ...base, courseId: "crs_1" }).ok).toBe(true);
  });

  it("acepta material de una clase", () => {
    expect(validateResource({ ...base, classSessionId: "cls_1" }).ok).toBe(true);
  });

  /**
   * Con los dos aparecería duplicado: en la ficha del curso y en la clase.
   */
  it("rechaza material con curso Y clase", () => {
    const r = validateResource({ ...base, courseId: "crs_1", classSessionId: "cls_1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_container");
    expect(r.status).toBe(422);
    expect(r.message).toContain("no en los dos");
  });

  /** Sin contenedor no se puede mostrar en ninguna pantalla. */
  it("rechaza material sin contenedor, y lo dice distinto", () => {
    const r = validateResource(base);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_container");
    expect(r.message).toContain("tiene que ir en un curso o en una clase");
  });

  /**
   * `course_module_id` es una referencia OPCIONAL al temario, no un
   * contenedor: `course_module` tiene 0 filas (DV-002). Que venga o no, no
   * cambia la validación.
   */
  it("el módulo del temario no cuenta como contenedor", () => {
    expect(
      validateResource({ ...base, courseModuleId: "mod_1" }).ok,
      "solo con módulo no alcanza"
    ).toBe(false);
    expect(
      validateResource({ ...base, courseId: "crs_1", courseModuleId: "mod_1" }).ok
    ).toBe(true);
  });
});

/**
 * FR-007 — Los recursos son ENLACES. Uno que no abre nada es peor que un
 * material ausente: el alumno lo aprieta y cree que el problema es suyo.
 */
describe("validateResource — el enlace tiene que abrir algo", () => {
  it.each([
    "drive.google.com/guia",
    "no es una url",
    "",
    "   ",
    "javascript:alert(1)",
    "file:///C:/guia.pdf",
  ])("rechaza «%s»", (url) => {
    const r = validateResource({ ...base, url, courseId: "crs_1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_url");
  });

  it.each([
    "https://drive.google.com/guia",
    "http://intranet.cadit.uy/material.pdf",
    "https://youtu.be/abc123",
  ])("acepta «%s»", (url) => {
    expect(validateResource({ ...base, url, courseId: "crs_1" }).ok).toBe(true);
  });

  it("un título en blanco se rechaza con su propio motivo", () => {
    const r = validateResource({ ...base, title: "   ", courseId: "crs_1" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_title");
  });

  /**
   * El orden importa: si falta el contenedor Y la URL está mal, se informa
   * primero el contenedor. Arreglar el enlace no habría servido de nada.
   */
  it("la falta de contenedor se informa ANTES que la URL inválida", () => {
    const r = validateResource({ title: "x", url: "no-es-url" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("invalid_container");
  });
});
