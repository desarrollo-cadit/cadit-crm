import { describe, expect, it } from "vitest";
import {
  MONEY_DECIMALS_HINT,
  MONEY_MAX_DIGITS,
  MONEY_NO_DECIMALS_HINT,
  borrarSobreSeparador,
  caretDigitsAfterParse,
  caretForDigits,
  digitsBeforeCaret,
  formatMoney,
  moneyHint,
  parseMoneyInput,
} from "@/lib/money-input";
import { MONEY_MAX_MINOR } from "@/lib/money";

/**
 * Montos con separador de miles (es-UY) y coma decimal. Lo que sale del campo
 * son CENTÉSIMOS enteros (DV-008 revisada el 2026-10-21).
 */
const v = (text: string, opts?: { maxDecimals?: 0 | 2 }) => {
  const r = parseMoneyInput(text, opts);
  return r.ok ? r.value : r;
};

describe("formatMoney", () => {
  it("agrupa de a tres con punto (el valor viene en centésimos)", () => {
    expect(formatMoney(500000)).toBe("5.000");
    expect(formatMoney(123456700)).toBe("1.234.567");
    expect(formatMoney(99900)).toBe("999");
    expect(formatMoney(0)).toBe("0");
  });

  it("muestra los centésimos solo si los hay", () => {
    expect(formatMoney(524532)).toBe("5.245,32");
    expect(formatMoney(524530)).toBe("5.245,30");
  });

  it("respeta lo que se está tipeando después de la coma", () => {
    expect(formatMoney(524530, "3")).toBe("5.245,3");
    expect(formatMoney(500, "")).toBe("5,");
    expect(formatMoney(50, "5")).toBe("0,5");
  });

  it("vacío para null", () => {
    expect(formatMoney(null)).toBe("");
  });
});

describe("parseMoneyInput", () => {
  it("enteros sin separadores → centésimos", () => {
    expect(v("5000")).toBe(500000);
    expect(v("1234567")).toBe(123456700);
  });

  it("coma decimal con miles", () => {
    expect(v("5.245,32")).toBe(524532);
    expect(v("5245,3")).toBe(524530);
  });

  it("pegado con símbolo de moneda", () => {
    expect(v("$ 5.245,32")).toBe(524532);
    expect(v("$ 5.000")).toBe(500000);
    expect(v("US$ 1.200")).toBe(120000);
    expect(v(" 12 500 ")).toBe(1250000);
  });

  it("a medio tipear", () => {
    expect(parseMoneyInput("5,")).toEqual({ ok: true, value: 500, fraction: "" });
    expect(parseMoneyInput(",5")).toEqual({ ok: true, value: 50, fraction: "5" });
    expect(parseMoneyInput("5245,3")).toEqual({ ok: true, value: 524530, fraction: "3" });
    expect(parseMoneyInput("5000")).toEqual({ ok: true, value: 500000, fraction: null });
  });

  it("más de dos decimales se rechaza", () => {
    expect(v("5.245,321")).toEqual({ ok: false, reason: "decimales" });
  });

  it("dos comas se rechazan", () => {
    expect(v("5,245,32")).toEqual({ ok: false, reason: "formato" });
  });

  it("sin decimales (guaraníes): cualquier coma se rechaza", () => {
    expect(v("5000,5", { maxDecimals: 0 })).toEqual({ ok: false, reason: "decimales" });
    expect(v("5.000", { maxDecimals: 0 })).toBe(500000);
  });

  it("vacío es null, no cero", () => {
    expect(v("")).toBeNull();
    expect(v("   ")).toBeNull();
    expect(v("$")).toBeNull();
  });

  it("los ceros a la izquierda se descartan, pero el cero solo vale", () => {
    expect(v("007")).toBe(700);
    expect(v("0")).toBe(0);
    expect(v("000")).toBe(0);
  });

  it("corta la parte entera en el máximo de dígitos", () => {
    const muchos = "9".repeat(MONEY_MAX_DIGITS + 3);
    expect(v(muchos)).toBe(Number("9".repeat(MONEY_MAX_DIGITS)) * 100);
  });

  it("el máximo entra en un bigint y en un número seguro", () => {
    expect(v(`${"9".repeat(MONEY_MAX_DIGITS)},99`)).toBe(MONEY_MAX_MINOR);
    expect(Number.isSafeInteger(MONEY_MAX_MINOR)).toBe(true);
  });

  it("ignora letras sueltas", () => {
    expect(v("50a0")).toBe(50000);
  });
});

describe("moneyHint", () => {
  it("dice el motivo", () => {
    expect(moneyHint("decimales", 2)).toBe(MONEY_DECIMALS_HINT);
    expect(moneyHint("decimales", 0)).toBe(MONEY_NO_DECIMALS_HINT);
    expect(MONEY_DECIMALS_HINT).not.toMatch(/sin centésimos/);
  });
});

describe("caret", () => {
  it("cuenta dígitos y coma a la izquierda del cursor", () => {
    expect(digitsBeforeCaret("5.0000", 6)).toBe(5);
    expect(digitsBeforeCaret("1.234.567", 5)).toBe(4);
    expect(digitsBeforeCaret("1.234", 0)).toBe(0);
    expect(digitsBeforeCaret("5.245,3", 7)).toBe(6);
  });

  it("ubica el cursor después del mismo carácter en el texto formateado", () => {
    expect(caretForDigits("50.000", 5)).toBe(6);
    expect(caretForDigits("1.234.567", 4)).toBe(5);
    expect(caretForDigits("1.234", 1)).toBe(1);
    expect(caretForDigits("1.234", 0)).toBe(0);
    expect(caretForDigits("", 3)).toBe(0);
    expect(caretForDigits("5,", 2)).toBe(2);
    expect(caretForDigits("5.245,3", 6)).toBe(7);
  });

  it("los ceros a la izquierda descartados no corren el cursor afuera", () => {
    expect(caretForDigits("7", 3)).toBe(1);
  });
});

describe("caretDigitsAfterParse", () => {
  const p = (raw: string) => {
    const r = parseMoneyInput(raw);
    if (!r.ok) throw new Error("no parsea");
    return r;
  };

  it("sin ceros descartados, los mismos dígitos a la izquierda", () => {
    expect(caretDigitsAfterParse("5.0000", 6, p("5.0000"))).toBe(5);
    expect(caretDigitsAfterParse("15.000", 1, p("15.000"))).toBe(1);
  });

  it("descuenta los ceros a la izquierda que se van", () => {
    expect(caretDigitsAfterParse("007", 3, p("007"))).toBe(1);
    expect(caretDigitsAfterParse("05.000", 1, p("05.000"))).toBe(0);
  });

  it("el cero solo queda", () => {
    expect(caretDigitsAfterParse("00", 2, p("00"))).toBe(1);
  });

  it("vacío es cero", () => {
    expect(caretDigitsAfterParse("", 0, p(""))).toBe(0);
  });

  it("no pasa del largo del valor (lo que excede el máximo se corta)", () => {
    const raw = "1".repeat(MONEY_MAX_DIGITS + 3);
    expect(caretDigitsAfterParse(raw, raw.length, p(raw))).toBe(MONEY_MAX_DIGITS);
  });

  it("después de la coma, cuenta la coma y los decimales", () => {
    // "5245,3|" → "5.245,3|": 4 dígitos + coma + 1
    expect(caretDigitsAfterParse("5245,3", 6, p("5245,3"))).toBe(6);
    // "5,|" → "5,|"
    expect(caretDigitsAfterParse("5,", 2, p("5,"))).toBe(2);
    // ",5|" → "0,5|"
    expect(caretDigitsAfterParse(",5", 2, p(",5"))).toBe(3);
  });
});

/**
 * Borrar justo al lado de un punto: el navegador borra el punto, el formato lo
 * vuelve a poner y "no pasa nada". Se salta el punto y se borra el dígito.
 */
describe("borrarSobreSeparador", () => {
  it("Backspace después del punto borra el dígito anterior", () => {
    // "5.|000" → borra el 5 → 0 (los ceros a la izquierda no quedan)
    expect(borrarSobreSeparador("5.000", 2, "atras")).toEqual({
      value: 0,
      fraction: null,
      caretDigits: 0,
    });
    // "12.|345" → borra el 2 → "1.345", cursor después del 1
    expect(borrarSobreSeparador("12.345", 3, "atras")).toEqual({
      value: 134500,
      fraction: null,
      caretDigits: 1,
    });
  });

  it("Suprimir antes del punto borra el dígito siguiente", () => {
    // "12|.345" → borra el 3 → "1.245"
    expect(borrarSobreSeparador("12.345", 2, "adelante")).toEqual({
      value: 124500,
      fraction: null,
      caretDigits: 2,
    });
  });

  it("conserva los decimales que se estaban tipeando", () => {
    // "12.|345,6" → "1.345,6"
    expect(borrarSobreSeparador("12.345,6", 3, "atras")).toEqual({
      value: 134560,
      fraction: "6",
      caretDigits: 1,
    });
  });

  it("lejos de un punto no interviene", () => {
    expect(borrarSobreSeparador("12.345", 5, "atras")).toBeNull();
    expect(borrarSobreSeparador("12.345", 4, "adelante")).toBeNull();
    expect(borrarSobreSeparador("", 0, "atras")).toBeNull();
    expect(borrarSobreSeparador("5.245,32", 6, "atras")).toBeNull();
  });

  it("los ceros que quedan a la izquierda se colapsan en 0", () => {
    expect(borrarSobreSeparador("1.000", 2, "atras")).toEqual({
      value: 0,
      fraction: null,
      caretDigits: 0,
    });
  });
});
