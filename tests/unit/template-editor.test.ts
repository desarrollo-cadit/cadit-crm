import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TemplateEditor } from "@/components/grading/template-editor";
import { etiquetaDePlantilla, type Template } from "@/lib/grading-template";

/**
 * 031 (T014/T015) — El editor de la plantilla y la etiqueta que la resume en
 * la planilla.
 *
 * El editor es presentacional: recibe la plantilla y avisa cambios. Lo que se
 * fija acá es lo que la persona necesita ver ANTES de guardar —cuánto suman
 * los ejercicios y cuánto falta— para que el 422 del servidor sea la red, no
 * la primera noticia.
 */

const NUMERICA: Template = {
  scale: "numeric",
  minScore: 60,
  requiresApproval: false,
  criteria: [
    { id: "c1", name: "Modelado", maxPoints: 40 },
    { id: "c2", name: "Planos", maxPoints: 30 },
    { id: "c3", name: "Render", maxPoints: 30 },
  ],
  textFields: [{ id: "f1", name: "Fortalezas", required: true }],
};

const render = (value: Template) =>
  renderToStaticMarkup(
    createElement(TemplateEditor, {
      value,
      onChange: () => {},
      onSave: () => {},
      onCancel: () => {},
      saving: false,
    })
  );

describe("TemplateEditor", () => {
  it("muestra ejercicios, campos y la suma en vivo", () => {
    const html = render(NUMERICA);
    expect(html).toContain("Modelado");
    expect(html).toContain("Fortalezas");
    expect(html).toContain("Suman 100");
    expect(html).toContain("Requiere aprobación");
  });

  it("dice cuánto falta cuando no suman 100", () => {
    const html = render({ ...NUMERICA, criteria: NUMERICA.criteria.slice(0, 2) });
    expect(html).toContain("Suman 70");
    expect(html).toContain("faltan 30");
  });

  it("en aprobado/no aprobado no ofrece mínimo ni ejercicios", () => {
    const html = render({
      scale: "pass_fail",
      minScore: null,
      requiresApproval: false,
      criteria: [],
      textFields: [],
    });
    expect(html).not.toContain("Nota mínima");
    expect(html).not.toContain("Agregar ejercicio");
    expect(html).toContain("Agregar campo de texto");
  });
});

describe("etiquetaDePlantilla", () => {
  it("numérica dice con cuánto aprueba", () => {
    expect(etiquetaDePlantilla(NUMERICA)).toBe("Numérica · aprueba con 60");
  });

  it("aprobado/no aprobado", () => {
    expect(
      etiquetaDePlantilla({ ...NUMERICA, scale: "pass_fail", minScore: null, criteria: [] })
    ).toBe("Aprobado / no aprobado");
  });
});
