import { describe, expect, it } from "vitest";
import { parseMoney } from "../../scripts/import/parse-money";

/**
 * La planilla de 2026 trae montos como "$13,680.00" (coma de miles, punto
 * decimal) o "10.000.000" (guaraníes, punto de miles). Desde DV-008 revisada
 * (2026-10-21) se guardan CENTÉSIMOS: nada de redondear a entero.
 */
describe("import cadit-2026 — parseMoney", () => {
  it("pesos con centésimos → centésimos", () => {
    expect(parseMoney("$13,680.00")).toEqual({ amount: 1368000, currency: "UYU" });
    expect(parseMoney("$5,245.32")).toEqual({ amount: 524532, currency: "UYU" });
    expect(parseMoney("$0.00")).toEqual({ amount: 0, currency: "UYU" });
  });

  it("guaraníes con punto de miles", () => {
    expect(parseMoney("10.000.000")).toEqual({ amount: 1000000000, currency: "PYG" });
  });

  it("vacío o sin dígitos es null", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("$")).toBeNull();
  });
});
