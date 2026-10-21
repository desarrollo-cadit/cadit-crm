import { describe, expect, it } from "vitest";
import {
  MONEY_MAX_DIGITS,
  borrarSobreSeparador,
  caretDigitsAfterParse,
  caretForDigits,
  digitsBeforeCaret,
  formatMoney,
  parseMoneyInput,
} from "@/lib/money-input";

/**
 * Montos con separador de miles (es-UY). Los montos son ENTEROS sin
 * centésimos (DV-008): la coma no se acepta, se avisa.
 */
describe("formatMoney", () => {
  it("agrupa de a tres con punto", () => {
    expect(formatMoney(5000)).toBe("5.000");
    expect(formatMoney(1234567)).toBe("1.234.567");
    expect(formatMoney(999)).toBe("999");
    expect(formatMoney(0)).toBe("0");
  });

  it("vacío para null", () => {
    expect(formatMoney(null)).toBe("");
  });
});

describe("parseMoneyInput", () => {
  it("lo tipeado sin separadores", () => {
    expect(parseMoneyInput("5000")).toEqual({ ok: true, value: 5000 });
    expect(parseMoneyInput("1234567")).toEqual({ ok: true, value: 1234567 });
  });

  it("lo pegado con puntos o con símbolo de moneda", () => {
    expect(parseMoneyInput("5.000")).toEqual({ ok: true, value: 5000 });
    expect(parseMoneyInput("$ 5.000")).toEqual({ ok: true, value: 5000 });
    expect(parseMoneyInput("US$ 1.200")).toEqual({ ok: true, value: 1200 });
    expect(parseMoneyInput(" 12 500 ")).toEqual({ ok: true, value: 12500 });
  });

  it("vacío es null, no cero", () => {
    expect(parseMoneyInput("")).toEqual({ ok: true, value: null });
    expect(parseMoneyInput("   ")).toEqual({ ok: true, value: null });
    expect(parseMoneyInput("$")).toEqual({ ok: true, value: null });
  });

  it("los ceros a la izquierda se descartan, pero el cero solo vale", () => {
    expect(parseMoneyInput("007")).toEqual({ ok: true, value: 7 });
    expect(parseMoneyInput("0")).toEqual({ ok: true, value: 0 });
    expect(parseMoneyInput("000")).toEqual({ ok: true, value: 0 });
  });

  it("una coma no se acepta: los montos van sin centésimos", () => {
    expect(parseMoneyInput("5000,50")).toEqual({ ok: false, reason: "decimales" });
    expect(parseMoneyInput("5.000,00")).toEqual({ ok: false, reason: "decimales" });
    expect(parseMoneyInput(",")).toEqual({ ok: false, reason: "decimales" });
  });

  it("corta en el máximo de dígitos", () => {
    const muchos = "9".repeat(MONEY_MAX_DIGITS + 3);
    const r = parseMoneyInput(muchos);
    expect(r).toEqual({ ok: true, value: Number("9".repeat(MONEY_MAX_DIGITS)) });
  });

  it("el máximo entra en un integer de Postgres", () => {
    expect(Number("9".repeat(MONEY_MAX_DIGITS))).toBeLessThanOrEqual(2_147_483_647);
  });

  it("ignora letras sueltas", () => {
    expect(parseMoneyInput("50a0")).toEqual({ ok: true, value: 500 });
  });
});

describe("caret", () => {
  it("cuenta los dígitos a la izquierda del cursor", () => {
    expect(digitsBeforeCaret("5.0000", 6)).toBe(5);
    expect(digitsBeforeCaret("1.234.567", 5)).toBe(4);
    expect(digitsBeforeCaret("1.234", 0)).toBe(0);
  });

  it("ubica el cursor después del mismo dígito en el texto formateado", () => {
    expect(caretForDigits("50.000", 5)).toBe(6);
    expect(caretForDigits("1.234.567", 4)).toBe(5);
    expect(caretForDigits("1.234", 1)).toBe(1);
    expect(caretForDigits("1.234", 0)).toBe(0);
    expect(caretForDigits("", 3)).toBe(0);
  });

  it("los ceros a la izquierda descartados no corren el cursor afuera", () => {
    expect(caretForDigits("7", 3)).toBe(1);
  });
});

describe("caretDigitsAfterParse", () => {
  it("sin ceros descartados, los mismos dígitos a la izquierda", () => {
    expect(caretDigitsAfterParse("5.0000", 6, 50000)).toBe(5);
    expect(caretDigitsAfterParse("15.000", 1, 15000)).toBe(1);
  });

  it("descuenta los ceros a la izquierda que se van", () => {
    expect(caretDigitsAfterParse("007", 3, 7)).toBe(1);
    expect(caretDigitsAfterParse("05.000", 1, 5000)).toBe(0);
  });

  it("el cero solo queda", () => {
    expect(caretDigitsAfterParse("00", 2, 0)).toBe(1);
  });

  it("vacío es cero", () => {
    expect(caretDigitsAfterParse("", 0, null)).toBe(0);
  });

  it("no pasa del largo del valor (lo que excede el máximo se corta)", () => {
    expect(caretDigitsAfterParse("1".repeat(12), 12, 111111111)).toBe(9);
  });
});

/**
 * Borrar justo al lado de un punto: el navegador borra el punto, el formato lo
 * vuelve a poner y "no pasa nada". Se salta el punto y se borra el dígito.
 */
describe("borrarSobreSeparador", () => {
  it("Backspace después del punto borra el dígito anterior", () => {
    // "5.|000" → borra el 5 → 0 (los ceros a la izquierda no quedan)
    expect(borrarSobreSeparador("5.000", 2, "atras")).toEqual({ value: 0, caretDigits: 0 });
    // "12.|345" → borra el 2 → "1.345", cursor después del 1
    expect(borrarSobreSeparador("12.345", 3, "atras")).toEqual({ value: 1345, caretDigits: 1 });
  });

  it("Suprimir antes del punto borra el dígito siguiente", () => {
    // "12|.345" → borra el 3 → "1.245"
    expect(borrarSobreSeparador("12.345", 2, "adelante")).toEqual({ value: 1245, caretDigits: 2 });
  });

  it("lejos de un punto no interviene", () => {
    expect(borrarSobreSeparador("12.345", 5, "atras")).toBeNull();
    expect(borrarSobreSeparador("12.345", 4, "adelante")).toBeNull();
    expect(borrarSobreSeparador("", 0, "atras")).toBeNull();
  });

  it("los ceros que quedan a la izquierda se colapsan en 0", () => {
    expect(borrarSobreSeparador("1.000", 2, "atras")).toEqual({ value: 0, caretDigits: 0 });
  });
});
