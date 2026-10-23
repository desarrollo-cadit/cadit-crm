import { describe, expect, it } from "vitest";
import { MAX_SIGUIENTES, validarSiguientes } from "@/lib/rutas-de-cursos";

/**
 * 046 (T014; US2, FR-005) — Las rutas entre cursos: qué se puede guardar.
 */

const cursos = new Map([
  ["arq", { kind: "curso" as const }],
  ["mep", { kind: "curso" as const }],
  ["est", { kind: "curso" as const }],
  ["tal", { kind: "taller" as const }],
]);

describe("validarSiguientes", () => {
  it("acepta una lista ordenada y la devuelve en el mismo orden", () => {
    expect(validarSiguientes("arq", ["mep", "est"], cursos)).toEqual({ ok: true, ids: ["mep", "est"] });
  });

  it("acepta la lista vacía (sin siguientes)", () => {
    expect(validarSiguientes("arq", [], cursos)).toEqual({ ok: true, ids: [] });
  });

  it("un curso no puede seguirse a sí mismo", () => {
    expect(validarSiguientes("arq", ["mep", "arq"], cursos)).toEqual({
      ok: false,
      code: "invalid_body",
      message: "Un curso no puede seguirse a sí mismo.",
    });
  });

  it("rechaza repetidos", () => {
    expect(validarSiguientes("arq", ["mep", "mep"], cursos)).toMatchObject({
      ok: false,
      message: "Hay un curso repetido en la lista.",
    });
  });

  it("rechaza cursos que no existen en la organización", () => {
    expect(validarSiguientes("arq", ["ajeno"], cursos)).toMatchObject({
      ok: false,
      code: "invalid_body",
      message: "Alguno de los cursos elegidos no existe.",
    });
  });

  it("el origen ajeno o inexistente es not_found", () => {
    expect(validarSiguientes("ajeno", ["mep"], cursos)).toMatchObject({ ok: false, code: "not_found" });
  });

  it("los talleres no forman parte de las rutas, ni de origen ni de destino", () => {
    const msg = "Los talleres no forman parte de las rutas entre cursos.";
    expect(validarSiguientes("arq", ["tal"], cursos)).toMatchObject({ ok: false, message: msg });
    expect(validarSiguientes("tal", ["arq"], cursos)).toMatchObject({ ok: false, message: msg });
  });

  it("los ciclos se permiten: cada sugerencia descarta lo ya hecho", () => {
    expect(validarSiguientes("mep", ["arq"], cursos)).toMatchObject({ ok: true });
  });

  it(`a lo sumo ${MAX_SIGUIENTES} siguientes`, () => {
    const muchos = new Map(Array.from({ length: 30 }, (_, i) => [`c${i}`, { kind: "curso" as const }]));
    const ids = Array.from({ length: MAX_SIGUIENTES + 1 }, (_, i) => `c${i + 1}`);
    expect(validarSiguientes("c0", ids, muchos)).toMatchObject({ ok: false, code: "invalid_body" });
  });
});
