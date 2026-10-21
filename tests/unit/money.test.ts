import { describe, expect, it } from "vitest";
import {
  CURRENCY_SYMBOL,
  MONEY_MAX_MINOR,
  currencyHasDecimals,
  formatAmount,
  formatAmountWithCode,
  formatMinorNumber,
  minorFromDb,
  minorToCsv,
  splitMinor,
  toMajor,
  toMinor,
} from "@/lib/money";
import { formatAmount as formatAmountFromUtils } from "@/lib/utils";
import { minorAmount, positiveMinorAmount } from "@/lib/money-schema";

/**
 * Montos en CENTÉSIMOS (bigint, DV-008 revisada el 2026-10-21): la base, la
 * API interna y los cálculos hablan en unidades menores; solo el formateo
 * divide por 100.
 */
describe("formatMinorNumber", () => {
  it("sin centésimos no muestra decimales", () => {
    expect(formatMinorNumber(500000, "UYU")).toBe("5.000");
    expect(formatMinorNumber(0, "UYU")).toBe("0");
    expect(formatMinorNumber(123456700, "USD")).toBe("1.234.567");
  });

  it("con centésimos muestra los dos, con coma", () => {
    expect(formatMinorNumber(524532, "UYU")).toBe("5.245,32");
    expect(formatMinorNumber(524530, "UYU")).toBe("5.245,30");
    expect(formatMinorNumber(5, "USD")).toBe("0,05");
  });

  it("guaraníes nunca muestran decimales", () => {
    expect(formatMinorNumber(524532, "PYG")).toBe("5.245");
    expect(formatMinorNumber(524550, "PYG")).toBe("5.246");
    expect(currencyHasDecimals("PYG")).toBe(false);
    expect(currencyHasDecimals("UYU")).toBe(true);
  });

  it("negativos llevan el signo", () => {
    expect(formatMinorNumber(-524532, "UYU")).toBe("-5.245,32");
  });
});

describe("formatAmount", () => {
  it("símbolo de SU moneda, mismo formato que antes para enteros", () => {
    expect(formatAmount(500000, "UYU")).toBe("$5.000");
    expect(formatAmount(500000, "PYG")).toBe("Gs. 5.000");
    expect(formatAmount(120000, "USD")).toBe("US$1.200");
    expect(formatAmount(524532, "UYU")).toBe("$5.245,32");
  });

  it("null es un guion; sin moneda asume pesos", () => {
    expect(formatAmount(null, "UYU")).toBe("—");
    expect(formatAmount(undefined, undefined)).toBe("—");
    expect(formatAmount(100, undefined)).toBe("$1");
  });

  it("utils re-exporta la misma función", () => {
    expect(formatAmountFromUtils).toBe(formatAmount);
  });

  it("un solo mapa de símbolos", () => {
    expect(CURRENCY_SYMBOL).toEqual({ UYU: "$", PYG: "Gs. ", USD: "US$" });
  });

  it("con código de moneda (correos internos)", () => {
    expect(formatAmountWithCode(1200000, "UYU")).toBe("UYU 12.000");
    expect(formatAmountWithCode(524532, "USD")).toBe("USD 5.245,32");
    expect(formatAmountWithCode(null, "UYU")).toBe("sin monto");
  });
});

describe("conversiones", () => {
  it("menor ↔ mayor", () => {
    expect(toMajor(524532)).toBe(5245.32);
    expect(toMinor(5245.32)).toBe(524532);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(13680)).toBe(1368000);
  });

  it("lo que devuelve Postgres (bigint/numeric como texto) vuelve a número", () => {
    expect(minorFromDb("524532")).toBe(524532);
    expect(minorFromDb(524532)).toBe(524532);
    expect(minorFromDb(BigInt(524532))).toBe(524532);
    expect(minorFromDb(null)).toBe(0);
    expect(minorFromDb(undefined)).toBe(0);
  });

  it("un total fuera del rango seguro no se redondea en silencio", () => {
    expect(() => minorFromDb("9007199254740993")).toThrow();
    expect(() => minorFromDb("12.5")).toThrow();
  });

  it("el máximo cargable entra holgado en un número seguro", () => {
    expect(Number.isSafeInteger(MONEY_MAX_MINOR)).toBe(true);
  });
});

describe("splitMinor", () => {
  it("el resto de centésimos va a la PRIMERA cuota y la suma da exacto", () => {
    expect(splitMinor(1000000, 3)).toEqual([333334, 333333, 333333]);
    expect(splitMinor(524532, 4)).toEqual([131133, 131133, 131133, 131133]);
    expect(splitMinor(524535, 4)).toEqual([131136, 131133, 131133, 131133]);
    for (const [total, n] of [
      [1000000, 3],
      [524532, 4],
      [1, 7],
    ] as const) {
      expect(splitMinor(total, n).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});

/**
 * El CSV de facturación usa "," como separador de columnas: los decimales van
 * con PUNTO para no partir el campo, en unidades MAYORES.
 */
describe("minorToCsv", () => {
  it("unidades mayores con punto decimal", () => {
    expect(minorToCsv(524532, "UYU")).toBe("5245.32");
    expect(minorToCsv(500000, "USD")).toBe("5000.00");
    expect(minorToCsv(5, "UYU")).toBe("0.05");
  });

  it("guaraníes sin decimales", () => {
    expect(minorToCsv(500000, "PYG")).toBe("5000");
  });
});

describe("esquemas de la API", () => {

  it("aceptan centésimos enteros y rechazan unidades con decimales", () => {
    expect(minorAmount.safeParse(524532).success).toBe(true);
    expect(minorAmount.safeParse(5245.32).success).toBe(false);
    expect(minorAmount.safeParse(-1).success).toBe(false);
    expect(minorAmount.safeParse(MONEY_MAX_MINOR + 1).success).toBe(false);
  });

  it("un pago es de al menos un centésimo", () => {
    expect(positiveMinorAmount.safeParse(1).success).toBe(true);
    expect(positiveMinorAmount.safeParse(0).success).toBe(false);
  });
});
