import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CorreccionDelAlumno,
  type CorreccionPublicada,
} from "@/components/portal/student-submissions";

/**
 * 031 (T030, US3) — El alumno ve TODA la corrección publicada, sin pedirla.
 *
 * Es el pedido central del dueño: la nota, cada ejercicio con su puntaje y su
 * comentario, los campos de texto, la devolución, quién corrigió y cuándo. Y
 * sin corrección publicada, "Pendiente de corrección" — jamás un "no aprobada"
 * inventado (FR-005 de 010).
 */

const PUBLICADA: CorreccionPublicada = {
  assessmentId: "asm_1",
  scale: "numeric",
  minScore: 60,
  criteria: [
    { id: "c1", name: "Modelado", maxPoints: 40 },
    { id: "c2", name: "Planos", maxPoints: 30 },
    { id: "c3", name: "Render", maxPoints: 30 },
  ],
  textFields: [{ id: "f1", name: "A mejorar", required: true }],
  correction: {
    id: "cor_1",
    submissionId: null,
    score: 80,
    passed: true,
    feedback: "Muy buen trabajo en general.",
    criterionScores: [
      { criterionId: "c1", points: 35, comment: "Prolijo" },
      { criterionId: "c2", points: 20, comment: null },
      { criterionId: "c3", points: 25, comment: null },
    ],
    textValues: [{ fieldId: "f1", value: "Las cotas del corte" }],
    correctedByName: "Ana Profe",
    publishedAt: "2026-10-11T12:00:00.000Z",
  },
};

const render = (correccion: CorreccionPublicada | null) =>
  renderToStaticMarkup(createElement(CorreccionDelAlumno, { correccion }));

describe("CorreccionDelAlumno", () => {
  it("muestra la nota, cada ejercicio con puntaje/máximo/comentario y los campos", () => {
    const html = render(PUBLICADA);
    expect(html).toContain("80/100");
    expect(html).toContain("Modelado");
    expect(html).toContain("35 de 40");
    expect(html).toContain("Prolijo");
    expect(html).toContain("A mejorar");
    expect(html).toContain("Las cotas del corte");
    expect(html).toContain("Muy buen trabajo en general.");
    expect(html).toContain("Ana Profe");
  });

  it("sin corrección publicada dice «Pendiente de corrección», nunca desaprobada", () => {
    const html = render(null);
    expect(html).toContain("Pendiente de corrección");
    expect(html).not.toContain("No aprobada");
  });

  it("en aprobado/no aprobado no inventa una nota", () => {
    const html = render({
      ...PUBLICADA,
      scale: "numeric",
      minScore: null,
      criteria: [],
      textFields: [],
      correction: { ...PUBLICADA.correction, score: null, passed: false, criterionScores: [], textValues: [] },
    });
    expect(html).not.toContain("/100");
    expect(html).toContain("No aprobada");
  });
});
