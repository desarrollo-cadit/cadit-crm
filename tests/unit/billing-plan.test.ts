import { describe, expect, it } from "vitest";
import {
  buildInstallmentPlan,
  installmentStatus,
  outstandingBalance,
} from "@/server/billing";

/**
 * 008 (T007) — El criterio de cobranza, probado sin base de datos.
 *
 * La regla que gobierna todo: la suma del plan tiene que dar EXACTAMENTE el
 * total pactado. Un redondeo mal hecho cobra de menos y nadie lo nota hasta
 * que falta plata en la caja.
 */
describe("buildInstallmentPlan", () => {
  it("la suma de las cuotas es exactamente el monto, aunque no sea divisible", () => {
    for (const [amount, count] of [
      [100_000, 3],
      [57_000, 6],
      [11_550, 7],
      [1, 3],
      [10_000_000, 12],
    ] as const) {
      const plan = buildInstallmentPlan(amount, count, new Date("2026-09-01"));
      expect(plan).toHaveLength(count);
      expect(plan.reduce((s, p) => s + p.amount, 0)).toBe(amount);
    }
  });

  /**
   * El resto va a la PRIMERA cuota: la última es la que más se demora y la
   * que peor se explica por teléfono si es la distinta.
   */
  it("el resto cae en la primera cuota, no en la última", () => {
    const plan = buildInstallmentPlan(100_000, 3, new Date("2026-09-01"));
    expect(plan.map((p) => p.amount)).toEqual([33_334, 33_333, 33_333]);
  });

  it("vence una vez por mes desde la primera fecha", () => {
    const plan = buildInstallmentPlan(30_000, 3, new Date("2026-09-10"));
    expect(plan.map((p) => p.dueDate.toISOString().slice(0, 10))).toEqual([
      "2026-09-10",
      "2026-10-10",
      "2026-11-10",
    ]);
  });

  it("una sola cuota es un plan válido: el pago al contado", () => {
    const plan = buildInstallmentPlan(12_600, 1, new Date("2026-09-01"));
    expect(plan).toEqual([
      { number: 1, amount: 12_600, dueDate: new Date("2026-09-01") },
    ]);
  });

  it("rechaza planes imposibles", () => {
    expect(() => buildInstallmentPlan(1000, 0, new Date())).toThrow();
    expect(() => buildInstallmentPlan(-1, 3, new Date())).toThrow();
  });
});

describe("installmentStatus", () => {
  const vence = new Date("2026-09-10");
  const antes = new Date("2026-09-01");
  const despues = new Date("2026-09-20");

  it("pagada cuando los pagos llegan al monto, aunque haya vencido", () => {
    expect(installmentStatus(1000, 1000, vence, despues)).toBe("pagada");
    // De más (un redondeo del alumno) sigue siendo pagada, no un estado raro.
    expect(installmentStatus(1000, 1200, vence, despues)).toBe("pagada");
  });

  it("vencida gana sobre parcial: lo urgente es que pasó la fecha", () => {
    expect(installmentStatus(1000, 400, vence, despues)).toBe("vencida");
  });

  it("parcial cuando hay algo pago y todavía no venció", () => {
    expect(installmentStatus(1000, 400, vence, antes)).toBe("parcial");
  });

  it("pendiente cuando no se pagó nada y no venció", () => {
    expect(installmentStatus(1000, 0, vence, antes)).toBe("pendiente");
  });
});

describe("outstandingBalance", () => {
  it("suma lo que falta de cada cuota", () => {
    expect(
      outstandingBalance([
        { amount: 1000, paid: 1000, canceledAt: null },
        { amount: 1000, paid: 400, canceledAt: null },
        { amount: 1000, paid: 0, canceledAt: null },
      ])
    ).toBe(1600);
  });

  it("ignora las cuotas anuladas: un plan refinanciado no cobra dos veces", () => {
    expect(
      outstandingBalance([
        { amount: 1000, paid: 0, canceledAt: new Date() },
        { amount: 500, paid: 0, canceledAt: null },
      ])
    ).toBe(500);
  });

  it("un pago de más no genera saldo negativo", () => {
    expect(
      outstandingBalance([{ amount: 1000, paid: 1500, canceledAt: null }])
    ).toBe(0);
  });
});
