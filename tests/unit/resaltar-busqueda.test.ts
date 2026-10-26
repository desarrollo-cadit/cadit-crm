import { describe, expect, it } from "vitest";
import { tramosResaltados } from "@/lib/contact-search";

/**
 * 2026-10-26 — Qué parte de un nombre se resalta al buscar. Usa la MISMA
 * normalización que la coincidencia (sin tildes ni mayúsculas), pero corta el
 * texto ORIGINAL: lo que se ve conserva sus tildes.
 */
const marcado = (texto: string, q: string) =>
  tramosResaltados(texto, q)
    .map((t) => (t.marca ? `[${t.texto}]` : t.texto))
    .join("");

describe("tramosResaltados", () => {
  it("sin búsqueda, un solo tramo sin marca", () => {
    expect(tramosResaltados("Revit MEP", "")).toEqual([{ texto: "Revit MEP", marca: false }]);
    expect(tramosResaltados("Revit MEP", "   ")).toEqual([{ texto: "Revit MEP", marca: false }]);
  });

  it("marca cada palabra buscada, sin tildes ni mayúsculas, sobre el texto original", () => {
    expect(marcado("Martín Silva", "martin")).toBe("[Martín] Silva");
    expect(marcado("Diseño paramétrico", "DISENO metri")).toBe("[Diseño] para[métri]co");
  });

  it("marca todas las apariciones y une las que se pisan", () => {
    expect(marcado("Revit — Revit avanzado", "revit")).toBe("[Revit] — [Revit] avanzado");
    expect(marcado("AutoCAD 2D", "auto ocad")).toBe("[AutoCAD] 2D");
  });

  it("lo que no aparece no marca nada", () => {
    expect(marcado("Civil 3D", "revit")).toBe("Civil 3D");
  });

  it("vuelve a armar el texto entero", () => {
    const t = "Especialización BIM — Grupo 4";
    expect(tramosResaltados(t, "bim grupo").map((x) => x.texto).join("")).toBe(t);
  });
});
