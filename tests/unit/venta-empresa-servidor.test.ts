import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-11-06 — Venta de empresa, lado servidor: una inscripción CUBIERTA por la
 * venta de su empresa no puede recibir plan de cuotas ni pagos. Es la regla que
 * evita el error original (registrar plata "por persona" cuando se factura a la
 * empresa), así que se fija contra el mismo mock de la base que el resto de
 * cobranza.
 */

const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown }[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return { returning: () => Promise.resolve([values]), then: (r: (v: unknown) => void) => Promise.resolve([values]).then(r) };
      },
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{}]) }) }) }),
  }),
  schema: new Proxy(
    {},
    { get: (_t, tableName) => new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }) }
  ),
}));

describe("cobranza de una inscripción cubierta por la venta de su empresa", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    inserts.length = 0;
    vi.resetModules();
  });

  it("recordPayment: 422 cubierta_por_empresa y no escribe nada", async () => {
    // 1.ª consulta de recordPayment: la inscripción (cubierta).
    selectQueue.push([{ id: "enr_2", currency: "UYU", billingEnrollmentId: "enr_1" }]);
    const { recordPayment } = await import("@/server/billing");
    const r = await recordPayment("org_1", "enr_2", { amount: 1000, paidAt: new Date(), method: "efectivo" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.code).toBe("cubierta_por_empresa");
    }
    expect(inserts).toHaveLength(0);
  });

  it("generateInstallmentPlan: 422 cubierta_por_empresa y no crea cuotas", async () => {
    selectQueue.push([{ id: "enr_2", amount: null, currency: "UYU", billingEnrollmentId: "enr_1" }]);
    const { generateInstallmentPlan } = await import("@/server/billing");
    const r = await generateInstallmentPlan("org_1", "enr_2", { count: 3, firstDueDate: new Date() });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("cubierta_por_empresa");
    expect(inserts).toHaveLength(0);
  });
});
