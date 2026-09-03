import { describe, expect, it } from "vitest";
import { installmentStatus, outstandingBalance } from "@/server/billing";

/**
 * 008 (T018) — Los estados derivados en los bordes que importan para la
 * morosidad. La vista de morosidad se construye sobre estas dos funciones:
 * si mienten, se llama a gente que no debe nada, o peor, no se llama a quien
 * sí debe.
 */
describe("estados derivados en los bordes", () => {
  const vence = new Date("2026-09-10T00:00:00Z");

  it("el día del vencimiento todavía NO está vencida", () => {
    expect(installmentStatus(1000, 0, vence, new Date("2026-09-10T00:00:00Z"))).toBe(
      "pendiente"
    );
  });

  it("un segundo después del vencimiento ya lo está", () => {
    expect(installmentStatus(1000, 0, vence, new Date("2026-09-10T00:00:01Z"))).toBe(
      "vencida"
    );
  });

  /**
   * Una cuota vencida pero saldada NO es morosidad: se pagó tarde, pero se
   * pagó. Si apareciera en la lista, se llamaría a alguien que no debe nada.
   */
  it("vencida y saldada cuenta como pagada, no como vencida", () => {
    expect(installmentStatus(1000, 1000, vence, new Date("2026-12-01"))).toBe("pagada");
  });

  it("vencida con pago parcial sigue siendo vencida: falta plata", () => {
    expect(installmentStatus(1000, 999, vence, new Date("2026-12-01"))).toBe("vencida");
  });
});

describe("outstandingBalance", () => {
  it("un plan entero sin pagar debe el total", () => {
    const plan = [
      { amount: 19000, paid: 0, canceledAt: null },
      { amount: 19000, paid: 0, canceledAt: null },
      { amount: 19000, paid: 0, canceledAt: null },
    ];
    expect(outstandingBalance(plan)).toBe(57000);
  });

  it("un plan entero pago no debe nada", () => {
    const plan = [
      { amount: 19000, paid: 19000, canceledAt: null },
      { amount: 19000, paid: 19000, canceledAt: null },
    ];
    expect(outstandingBalance(plan)).toBe(0);
  });

  it("mezcla de parciales y completas", () => {
    expect(
      outstandingBalance([
        { amount: 19000, paid: 12000, canceledAt: null },
        { amount: 19000, paid: 19000, canceledAt: null },
        { amount: 19000, paid: 0, canceledAt: null },
      ])
    ).toBe(26000);
  });
});
