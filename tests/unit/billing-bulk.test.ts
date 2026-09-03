import { describe, expect, it } from "vitest";
import { decidirCobranza, MOTIVOS } from "@/server/billing-bulk";

/**
 * 022 — La regla del lote, probada donde importa.
 *
 * El contexto: **192 inscripciones con monto y 191 sin él**, y de las 192,
 * ninguna tiene plan de cuotas. Una acción que corre sobre 383 registros y se
 * equivoca no se nota mirando la pantalla: se nota cuando alguien recibe un
 * aviso de morosidad que no corresponde.
 *
 * Por eso la decisión vive en una función PURA y se prueba sin base.
 */

describe("decidirCobranza — sin monto no se factura", () => {
  /**
   * Son **191 de 383**, la mitad. Generarles un plan de cero pesos las metería
   * en la lista de morosos con saldo 0, que es ruido que nadie va a poder
   * explicar tres meses después.
   */
  it("una inscripción sin monto se saltea", () => {
    expect(decidirCobranza({ amount: null, yaTienePlan: false })).toEqual({
      aplica: false,
      motivo: "sin_monto",
    });
  });

  it("monto en cero es lo mismo que sin monto", () => {
    expect(decidirCobranza({ amount: 0, yaTienePlan: false }).aplica).toBe(false);
  });

  /**
   * El ORDEN de las dos reglas importa. Sin monto no hay nada que hacer,
   * tenga plan o no — y decirle "ya tiene plan" a algo que además no se puede
   * facturar manda a buscar el problema al lugar equivocado.
   */
  it("sin monto gana sobre ya-tiene-plan", () => {
    expect(decidirCobranza({ amount: null, yaTienePlan: true }).motivo).toBe("sin_monto");
  });
});

describe("decidirCobranza — correr el lote dos veces no duplica", () => {
  /**
   * Constitución IV. Y no es teórico: la acción se va a correr sobre una
   * cohorte, alguien va a dudar de si quedó, y la va a correr otra vez.
   */
  it("una inscripción que ya tiene plan se saltea", () => {
    expect(decidirCobranza({ amount: 15000, yaTienePlan: true })).toEqual({
      aplica: false,
      motivo: "ya_tiene_plan",
    });
  });

  it("con monto y sin plan, se aplica", () => {
    expect(decidirCobranza({ amount: 15000, yaTienePlan: false })).toEqual({
      aplica: true,
    });
  });
});

describe("los motivos se explican, no se codifican", () => {
  /**
   * Un lote de 192 que devuelve "18 saltadas" y nada más obliga a adivinar.
   * Cada motivo dice qué pasó **y qué hacer al respecto** (FR-007).
   */
  it("cada motivo tiene un texto que dice qué hacer", () => {
    for (const [clave, texto] of Object.entries(MOTIVOS)) {
      expect(texto.length, `${clave} sin explicación`).toBeGreaterThan(30);
    }
    expect(MOTIVOS.sin_monto).toContain("Cargalo");
    expect(MOTIVOS.ya_tiene_plan).toContain("de a una");
  });

  it("no hay motivo sin texto", () => {
    for (const m of ["sin_monto", "ya_tiene_plan", "no_encontrada"] as const) {
      expect(MOTIVOS[m]).toBeTruthy();
    }
  });
});

/**
 * El guard que sostiene la decisión de producto: **el lote no adivina**.
 *
 * `ModoCobranza` es una unión cerrada de dos variantes que el llamador declara.
 * Si alguien agregara un modo "automático" que decide por su cuenta si algo ya
 * se cobró, estaría inventando un hecho de plata — y con 152 facturas ya
 * cargadas, inventarlo mal significa reclamarle a alguien que ya pagó.
 */
describe("el modo se declara, no se deduce", () => {
  it("el módulo no exporta ninguna función que adivine el modo", async () => {
    const mod = await import("@/server/billing-bulk");
    const sospechosos = Object.keys(mod).filter((k) =>
      /(auto|infer|detect|adivin|guess)/i.test(k)
    );
    expect(sospechosos, `exports sospechosos: ${sospechosos.join(", ")}`).toEqual([]);
  });
});
