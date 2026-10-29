import { describe, expect, it } from "vitest";
import {
  ADJUNTOS_MAX,
  CONSIGNA_MAX,
  consignaSchema,
  rubricaParaElAlumno,
  validarConsigna,
} from "@/lib/assessment-consigna";

/**
 * 0084 — Lo que el alumno ve de la rúbrica ANTES de entregar: escala, mínimo,
 * criterios con su puntaje y las frases de cada nivel. No el circuito de
 * aprobación ni los campos internos del corrector.
 */
describe("rubricaParaElAlumno", () => {
  it("lleva escala, mínimo y criterios con descriptores; nada del circuito", () => {
    const r = rubricaParaElAlumno({
      scale: "numeric",
      minScore: 60,
      requiresApproval: true,
      criteria: [
        { id: "c1", name: "Modelado", maxPoints: 60, levels: { excelente: "Todo", bueno: "  " } },
        { id: "c2", name: "Planos", maxPoints: 40 },
      ],
      textFields: [{ id: "f1", name: "Notas internas", required: false }],
    });
    expect(r).toEqual({
      scale: "numeric",
      minScore: 60,
      criteria: [
        { id: "c1", name: "Modelado", maxPoints: 60, levels: { excelente: "Todo" } },
        { id: "c2", name: "Planos", maxPoints: 40 },
      ],
    });
    expect(r).not.toHaveProperty("requiresApproval");
    expect(r).not.toHaveProperty("textFields");
  });
});

/**
 * 0084 — La consigna de una evaluación: un texto en la gramática en línea y
 * una lista de enlaces adjuntos. La regla es pura para que el editor del
 * grupo y el del modelo del curso validen igual.
 */

describe("validarConsigna", () => {
  it("acepta texto y enlaces, recortados", () => {
    const r = validarConsigna({
      instructionsMd: "  Entregá **el modelo**.  ",
      adjuntos: [{ title: " Planos base ", url: " https://drive.google.com/x " }],
    });
    expect(r).toEqual({
      ok: true,
      data: {
        instructionsMd: "Entregá **el modelo**.",
        adjuntos: [{ title: "Planos base", url: "https://drive.google.com/x" }],
      },
    });
  });

  it("una consigna vacía es válida (no todas la tienen)", () => {
    expect(validarConsigna({ instructionsMd: "", adjuntos: [] }).ok).toBe(true);
  });

  it("un adjunto sin título o con un enlace que no es http(s) no pasa", () => {
    const sinTitulo = validarConsigna({ instructionsMd: "", adjuntos: [{ title: " ", url: "https://a.b" }] });
    expect(sinTitulo).toMatchObject({ ok: false, code: "adjunto_invalido" });
    const js = validarConsigna({ instructionsMd: "", adjuntos: [{ title: "x", url: "javascript:alert(1)" }] });
    expect(js).toMatchObject({ ok: false, code: "adjunto_invalido" });
  });

  it("tiene topes", () => {
    const larga = validarConsigna({ instructionsMd: "a".repeat(CONSIGNA_MAX + 1), adjuntos: [] });
    expect(larga.ok).toBe(false);
    const muchos = validarConsigna({
      instructionsMd: "",
      adjuntos: Array.from({ length: ADJUNTOS_MAX + 1 }, (_, i) => ({ title: `A${i}`, url: "https://a.b" })),
    });
    expect(muchos.ok).toBe(false);
  });

  it("el esquema de la API exige la forma", () => {
    expect(consignaSchema.safeParse({ instructionsMd: "x", adjuntos: [] }).success).toBe(true);
    expect(consignaSchema.safeParse({ instructionsMd: 3 }).success).toBe(false);
  });
});
