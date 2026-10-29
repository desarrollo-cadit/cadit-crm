import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConsignaView } from "@/components/grading/consigna-view";

/**
 * 0084 — Lo que el alumno ve antes de entregar: la consigna con la gramática
 * en línea (nunca HTML crudo), los adjuntos y la rúbrica con las frases de
 * cada nivel.
 */

function render(p: Partial<Parameters<typeof ConsignaView>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ConsignaView, {
      instructionsMd: "Modelá la **planta baja**. <script>alert(1)</script>",
      adjuntos: [{ id: "res_1", title: "Planos base", url: "https://drive.google.com/x" }],
      rubrica: {
        scale: "numeric",
        minScore: 60,
        criteria: [{ id: "c1", name: "Modelado", maxPoints: 40, levels: { bueno: "Errores menores" } }],
      },
      ...p,
    })
  );
}

describe("ConsignaView", () => {
  it("dibuja la consigna con la gramática en línea y escapa el HTML", () => {
    const html = render();
    expect(html).toContain("<strong>planta baja</strong>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("muestra los adjuntos como enlaces que abren aparte", () => {
    const html = render();
    expect(html).toContain('href="https://drive.google.com/x"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Planos base");
  });

  it("muestra la rúbrica: mínimo, criterio, puntos por nivel y la frase", () => {
    const html = render();
    expect(html).toContain("se aprueba con 60");
    expect(html).toContain("Modelado");
    expect(html).toContain("30 pts");
    expect(html).toContain("Errores menores");
  });

  it("aprobado/no aprobado sin consigna ni adjuntos no dibuja nada", () => {
    const html = render({
      instructionsMd: "",
      adjuntos: [],
      rubrica: { scale: "pass_fail", minScore: null, criteria: [] },
    });
    expect(html).toBe("");
  });
});
