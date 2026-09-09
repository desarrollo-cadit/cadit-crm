import { describe, expect, it } from "vitest";
import { resolveListPrice } from "@/server/courses";

/**
 * 011 (US3) — El precio de lista, y de dónde sale.
 *
 * El contexto medido que hace falta esta regla: **0 de las 41 cohortes tenía
 * precio de lista**, así que cada inscripción se cargaba a mano — y el
 * resultado fue **191 inscripciones sin monto**, la mitad, imposibles de
 * facturar.
 *
 * La regla es la misma forma que `resolveMinAttendance` de la 009: la cohorte
 * pisa al curso. Dos reglas de herencia que se leen distinto son dos
 * oportunidades de equivocarse.
 */

const SIN_CURSO = { listPrice: null, listCurrency: null };
const SIN_COHORTE = { cost: null, currency: null };

describe("la cohorte pisa al curso", () => {
  it("usa el precio de la cohorte cuando lo tiene", () => {
    expect(
      resolveListPrice(
        { cost: 90000, currency: "UYU" },
        { listPrice: 120000, listCurrency: "UYU" }
      )
    ).toEqual({ price: 90000, currency: "UYU" });
  });

  it("hereda el del curso cuando la cohorte no tiene", () => {
    expect(
      resolveListPrice(SIN_COHORTE, { listPrice: 120000, listCurrency: "UYU" })
    ).toEqual({ price: 120000, currency: "UYU" });
  });

  /**
   * **`null` no es cero.** Es la distinción que evita que una inscripción sin
   * precio cargado se registre como gratuita — y con 191 así, el error no
   * sería teórico.
   */
  it("sin precio en ninguno de los dos devuelve null, no cero", () => {
    expect(resolveListPrice(SIN_COHORTE, SIN_CURSO)).toBeNull();
  });

  it("un precio en cero se trata como ausente", () => {
    expect(resolveListPrice({ cost: 0, currency: "UYU" }, SIN_CURSO)).toBeNull();
    expect(
      resolveListPrice({ cost: 0, currency: "UYU" }, { listPrice: 500, listCurrency: "UYU" })
    ).toEqual({ price: 500, currency: "UYU" });
  });
});

describe("el precio y su moneda viajan juntos", () => {
  /**
   * Separarlos permite el estado imposible "10.000 sin moneda". Con UYU y PYG
   * conviviendo —y montos reales de 250 a 10.000.000— esa confusión es una
   * diferencia de mil veces (007).
   */
  it("hereda la moneda del mismo lugar que el precio", () => {
    expect(
      resolveListPrice(SIN_COHORTE, { listPrice: 6000000, listCurrency: "PYG" })
    ).toEqual({ price: 6000000, currency: "PYG" });
  });

  it("la cohorte no toma prestada la moneda del curso", () => {
    // La cohorte tiene precio propio en UYU; el curso está en PYG. Mezclar
    // sería informar guaraníes con un número de pesos.
    expect(
      resolveListPrice(
        { cost: 15000, currency: "UYU" },
        { listPrice: 6000000, listCurrency: "PYG" }
      )
    ).toEqual({ price: 15000, currency: "UYU" });
  });

  it("sin moneda declarada cae a UYU, que es la de la casa", () => {
    expect(resolveListPrice({ cost: 15000, currency: null }, SIN_CURSO)).toEqual({
      price: 15000,
      currency: "UYU",
    });
  });
});
