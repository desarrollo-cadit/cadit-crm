import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TemplateEditor } from "@/components/grading/template-editor";
import type { Template } from "@/lib/grading-template";

/**
 * 0084 — El editor de la plantilla ofrece, por criterio, una frase para cada
 * uno de los cuatro niveles fijos. Congelada la plantilla, las frases tampoco
 * se tocan (cambiarlas es cambiar la vara: 409 `plantilla_congelada`).
 */

const T: Template = {
  scale: "numeric",
  minScore: 60,
  requiresApproval: false,
  criteria: [{ id: "c1", name: "Modelado", maxPoints: 100, levels: { excelente: "Sin errores" } }],
  textFields: [],
};

function render(frozen: boolean) {
  return renderToStaticMarkup(
    createElement(TemplateEditor, {
      value: T,
      onChange: () => {},
      onSave: () => {},
      onCancel: () => {},
      saving: false,
      frozen,
    })
  );
}

describe("0084 — descriptores por nivel en el editor", () => {
  it("muestra los cuatro niveles con su porcentaje y la frase cargada", () => {
    const html = render(false);
    for (const n of ["Excelente", "Bueno", "Suficiente", "Insuficiente"]) {
      expect(html).toContain(`aria-label="${n} — Modelado"`);
    }
    expect(html).toContain("75 %");
    expect(html).toContain('value="Sin errores"');
  });

  it("congelada, las frases no se editan", () => {
    const html = render(true);
    expect(html).toMatch(/aria-label="Excelente — Modelado"[^>]*disabled|disabled[^>]*aria-label="Excelente — Modelado"/);
  });
});
