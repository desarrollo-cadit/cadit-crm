import { describe, expect, it } from "vitest";
import { entregaFinalSugerida, fechaDeFinSugerida } from "@/lib/fechas-de-cursada";

describe("fechaDeFinSugerida", () => {
  it("cuenta el día de inicio si es día de clase (2026-11-02 es lunes)", () => {
    expect(fechaDeFinSugerida("2026-11-02", [0], 1)).toBe("2026-11-02");
    expect(fechaDeFinSugerida("2026-11-02", [0], 4)).toBe("2026-11-23");
  });

  it("salta al primer día de clase si el inicio no lo es", () => {
    // martes 3 → primer miércoles (4), luego 11 y 18.
    expect(fechaDeFinSugerida("2026-11-03", [2], 3)).toBe("2026-11-18");
  });

  it("varios días por semana: lunes y jueves", () => {
    // lun 2, jue 5, lun 9, jue 12
    expect(fechaDeFinSugerida("2026-11-02", [0, 3], 4)).toBe("2026-11-12");
  });

  it("saltea recesos y feriados anuales", () => {
    // lunes 2, 9, 16, 23: el receso del 9 al 15 saca el 9 → la 3.ª clase es el 23.
    expect(
      fechaDeFinSugerida("2026-11-02", [0], 3, [{ fromDate: "2026-11-09", toDate: "2026-11-15" }])
    ).toBe("2026-11-23");
    // feriado anual el 16/11 (de 2020 en adelante) saca el 16 → 2, 9, 23.
    expect(
      fechaDeFinSugerida("2026-11-02", [0], 3, [
        { fromDate: "2020-11-16", toDate: "2020-11-16", recurring: true },
      ])
    ).toBe("2026-11-23");
  });

  it("sin datos suficientes no inventa nada", () => {
    expect(fechaDeFinSugerida("", [0], 4)).toBeNull();
    expect(fechaDeFinSugerida("2026-11-02", [], 4)).toBeNull();
    expect(fechaDeFinSugerida("2026-11-02", [0], null)).toBeNull();
    expect(fechaDeFinSugerida("2026-11-02", [0], 0)).toBeNull();
  });
});

describe("entregaFinalSugerida", () => {
  it("15 días después del fin, cruzando mes", () => {
    expect(entregaFinalSugerida("2026-11-23")).toBe("2026-12-08");
  });
  it("fecha inválida = null", () => {
    expect(entregaFinalSugerida("")).toBeNull();
  });
});
