import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CorrectionForm,
  borradorDeCorreccion,
  elegirNivel,
  type CorreccionEnEdicion,
} from "@/components/grading/correction-form";
import type { Template } from "@/lib/grading-template";

/**
 * 031 (T023, DV-013) — El formulario de corrección compartido.
 *
 * PRESENTACIONAL: recibe plantilla + lo que se está editando y avisa. Lo que se
 * fija es lo que la persona necesita ver mientras corrige —el máximo de cada
 * ejercicio, la nota que va saliendo y si con eso aprueba— y que los botones
 * dependan del `mode` que manda el servidor: la pantalla no decide permisos.
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
  textFields: [{ id: "f1", name: "A mejorar", required: true }],
};

const PASS_FAIL: Template = {
  scale: "pass_fail",
  minScore: null,
  requiresApproval: false,
  criteria: [],
  textFields: [],
};

function render(
  template: Template,
  value: CorreccionEnEdicion,
  extra: Partial<Parameters<typeof CorrectionForm>[0]> = {}
) {
  return renderToStaticMarkup(
    createElement(CorrectionForm, {
      template,
      value,
      onChange: () => {},
      onAction: () => {},
      mode: "publish",
      saving: false,
      ...extra,
    })
  );
}

const conPuntajes = (p: (number | null)[]): CorreccionEnEdicion => ({
  ...borradorDeCorreccion(NUMERICA, null),
  criterionScores: NUMERICA.criteria.map((c, i) => ({
    criterionId: c.id,
    points: p[i] ?? null,
    comment: "",
    level: null,
  })),
});

describe("CorrectionForm", () => {
  it("muestra cada ejercicio con su máximo y los campos de texto", () => {
    const html = render(NUMERICA, borradorDeCorreccion(NUMERICA, null));
    expect(html).toContain("Modelado");
    expect(html).toContain("de 40");
    expect(html).toContain("A mejorar");
    expect(html).toContain("Devolución");
  });

  it("la nota se calcula en vivo y dice si aprueba (35/20/25 → 80, mínimo 60)", () => {
    const html = render(NUMERICA, conPuntajes([35, 20, 25]));
    expect(html).toContain("80/100");
    expect(html).toContain("Aprobada");
  });

  it("con un ejercicio sin cargar no inventa una nota", () => {
    const html = render(NUMERICA, conPuntajes([35, 30, null]));
    expect(html).not.toContain("65/100");
    expect(html).toContain("Faltan puntajes");
  });

  it("debajo del mínimo dice que no aprueba", () => {
    const html = render(NUMERICA, conPuntajes([20, 20, 10]));
    expect(html).toContain("50/100");
    expect(html).toContain("No aprobada");
  });

  it("en modo `publish` ofrece publicar; en `submit`, enviar a aprobación", () => {
    const valor = borradorDeCorreccion(NUMERICA, null);
    const publicar = render(NUMERICA, valor, { mode: "publish" });
    expect(publicar).toContain("Publicar corrección");
    expect(publicar).not.toContain("Enviar a aprobación");

    const enviar = render(NUMERICA, valor, { mode: "submit" });
    expect(enviar).toContain("Enviar a aprobación");
    expect(enviar).not.toContain("Publicar corrección");
    expect(enviar).toContain("Guardar borrador");
  });

  it("muestra el comentario de devolución del aprobador si lo hay", () => {
    const html = render(NUMERICA, borradorDeCorreccion(NUMERICA, null), {
      reviewComment: "Revisá el puntaje de Render",
    });
    expect(html).toContain("Revisá el puntaje de Render");
  });

  it("en aprobado/no aprobado se elige el resultado y no hay ejercicios", () => {
    const html = render(PASS_FAIL, borradorDeCorreccion(PASS_FAIL, null));
    expect(html).toContain("Aprobado");
    expect(html).toContain("No aprobado");
    expect(html).not.toContain("/100");
  });
});

describe("borradorDeCorreccion", () => {
  it("parte de la versión guardada, con un lugar por cada ejercicio y campo", () => {
    const b = borradorDeCorreccion(NUMERICA, {
      submissionId: "sub_1",
      score: 80,
      passed: true,
      feedback: "Bien",
      criterionScores: [{ criterionId: "c2", points: 20, comment: "ok" }],
      textValues: [{ fieldId: "f1", value: "Cotas" }],
    });
    expect(b.submissionId).toBe("sub_1");
    expect(b.feedback).toBe("Bien");
    // 0084 — cada lugar lleva también el nivel (null si no se eligió).
    expect(b.criterionScores).toEqual([
      { criterionId: "c1", points: null, comment: "", level: null },
      { criterionId: "c2", points: 20, comment: "ok", level: null },
      { criterionId: "c3", points: null, comment: "", level: null },
    ]);
    expect(b.textValues).toEqual([{ fieldId: "f1", value: "Cotas" }]);
  });

  it("0084 — conserva el nivel guardado", () => {
    const b = borradorDeCorreccion(NUMERICA, {
      submissionId: null,
      score: null,
      passed: null,
      feedback: null,
      criterionScores: [{ criterionId: "c1", points: 30, comment: null, level: "bueno" }],
      textValues: [],
    });
    expect(b.criterionScores[0]).toEqual({ criterionId: "c1", points: 30, comment: "", level: "bueno" });
  });
});

/**
 * 0084 — Corregir con la rúbrica: se elige un nivel por criterio, los puntos
 * salen del nivel y se pueden ajustar a mano. La nota sigue siendo la suma.
 */
describe("0084 — el nivel por criterio", () => {
  const RUBRICA: Template = {
    ...NUMERICA,
    criteria: [
      { id: "c1", name: "Modelado", maxPoints: 40, levels: { bueno: "Errores menores" } },
      { id: "c2", name: "Planos", maxPoints: 30 },
      { id: "c3", name: "Render", maxPoints: 30 },
    ],
  };

  it("ofrece los cuatro niveles con sus puntos y la frase del nivel", () => {
    const html = render(RUBRICA, borradorDeCorreccion(RUBRICA, null));
    for (const n of ["Excelente", "Bueno", "Suficiente", "Insuficiente"]) expect(html).toContain(n);
    expect(html).toContain("Errores menores");
    expect(html).toContain("30 pts"); // Bueno = 75 % de 40
  });

  it("elegir un nivel pone sus puntos; elegir de nuevo el mismo lo quita", () => {
    const v = borradorDeCorreccion(RUBRICA, null);
    const conBueno = elegirNivel(RUBRICA, v, 0, "bueno");
    expect(conBueno.criterionScores[0]).toMatchObject({ level: "bueno", points: 30 });
    const sin = elegirNivel(RUBRICA, conBueno, 0, "bueno");
    expect(sin.criterionScores[0]).toMatchObject({ level: null, points: null });
  });

  it("el nivel elegido aparece marcado", () => {
    const v = elegirNivel(RUBRICA, borradorDeCorreccion(RUBRICA, null), 0, "excelente");
    const html = render(RUBRICA, v);
    expect(html).toMatch(/aria-pressed="true"[^>]*><span[^>]*>Excelente/);
    expect(html).not.toMatch(/aria-pressed="true"[^>]*><span[^>]*>Bueno/);
  });
});

/**
 * T046 — Hallado en el navegador: la carga del panel podía llegar DESPUÉS de
 * que el profesor ya estaba escribiendo y le vaciaba el formulario (el efecto
 * corre dos veces en desarrollo, y la segunda respuesta pisaba lo cargado).
 * Lo que mostraba la pantalla y lo que se iba a guardar dejaban de coincidir.
 * Sin DOM en los tests, se fija la forma: el efecto cancela al desmontarse y
 * la carga mira si sigue vigente después de CADA espera.
 */
describe("CorrectionPanel — una carga vieja no pisa lo que se está escribiendo", () => {
  const src = readFileSync(
    join(process.cwd(), "src/components/grading/correction-panel.tsx"),
    "utf8"
  );

  it("el efecto de carga devuelve una limpieza que la invalida", () => {
    expect(src).toMatch(
      /useEffect\(\(\) => \{\s*let vigente = true;[\s\S]*?return \(\) => \{\s*vigente = false;\s*\};\s*\}, \[cargar\]\)/
    );
  });

  it("después de cada await, la carga se descarta si ya no es vigente", () => {
    const cuerpo = src.slice(src.indexOf("const cargar"), src.indexOf("useEffect("));
    const esperas = cuerpo.match(/await /g)?.length ?? 0;
    const chequeos = cuerpo.match(/if \(!sigue\(\)\) return;/g)?.length ?? 0;
    expect(esperas).toBeGreaterThan(0);
    expect(chequeos).toBe(esperas);
  });
});
