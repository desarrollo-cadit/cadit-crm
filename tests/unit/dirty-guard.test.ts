import { describe, expect, it } from "vitest";
import { closeDecision, isDirty } from "@/lib/dirty-guard";

/**
 * Guard de cambios sin guardar en los diálogos: un click afuera o un Escape
 * con datos tipeados pregunta antes de perderlos; sin cambios, cierra.
 */
describe("isDirty", () => {
  it("iguales no es sucio", () => {
    expect(isDirty({ a: "x", b: 1 }, { a: "x", b: 1 })).toBe(false);
    expect(isDirty({ a: ["1", "2"] }, { a: ["1", "2"] })).toBe(false);
    expect(isDirty({ n: { x: null } }, { n: { x: null } })).toBe(false);
  });

  it("un campo cambiado es sucio", () => {
    expect(isDirty({ a: "" }, { a: "Ana" })).toBe(true);
    expect(isDirty({ amount: null }, { amount: 5000 })).toBe(true);
    expect(isDirty({ ok: false }, { ok: true })).toBe(true);
    expect(isDirty({ ids: ["1"] }, { ids: ["1", "2"] })).toBe(true);
  });

  it("los espacios en los bordes no cuentan como cambio", () => {
    expect(isDirty({ a: "" }, { a: "   " })).toBe(false);
    expect(isDirty({ a: "Ana" }, { a: "Ana " })).toBe(false);
  });

  it("vacío, null y undefined son lo mismo: nada cargado", () => {
    expect(isDirty({ a: "" }, { a: null })).toBe(false);
    expect(isDirty({ a: null }, { a: undefined })).toBe(false);
    expect(isDirty({ a: undefined }, {})).toBe(false);
  });

  it("un archivo elegido es un cambio", () => {
    expect(isDirty({ f: null }, { f: { name: "x.png" } })).toBe(true);
  });
});

describe("closeDecision", () => {
  it("sin cambios cierra", () => {
    expect(closeDecision({ dirty: false, busy: false })).toBe("close");
  });
  it("con cambios pregunta", () => {
    expect(closeDecision({ dirty: true, busy: false })).toBe("confirm");
  });
  it("con una acción en curso no cierra: se perdería su error", () => {
    expect(closeDecision({ dirty: false, busy: true })).toBe("ignore");
    expect(closeDecision({ dirty: true, busy: true })).toBe("ignore");
  });
});
