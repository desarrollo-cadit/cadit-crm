import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 008 (T013) — Reglas del registro de pagos contra un mock de la base, con el
 * mismo patrón que el resto del repo (courses.test.ts, intake-forms.test.ts).
 *
 * Los cuatro casos que cubre son los que, si fallan, cuestan plata: cobrar en
 * la moneda equivocada, perder un pago parcial, contar un pago anulado, y
 * duplicar un cobro por un doble click.
 */

const selectQueue: unknown[][] = [];
const insertReturnQueue: unknown[][] = [];
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
  // 012 (T024) — `withAuth` abre la transacción del pedido con
  // `getRootDb().transaction()` para declarar `app.current_org`. Sin este
  // doble, cualquier prueba que atraviese el borde de autenticación falla
  // antes de llegar al handler.
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        const resolveReturn = () =>
          Promise.resolve(insertReturnQueue.shift() ?? [values]);
        return {
          returning: () => resolveReturn(),
          onConflictDoNothing: () => ({ returning: () => resolveReturn() }),
          then: (resolve: (v: unknown) => void) => resolveReturn().then(resolve),
        };
      },
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([{}]) }) }) }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

describe("recordPayment", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertReturnQueue.length = 0;
    inserts.length = 0;
    vi.resetModules();
  });

  it("rechaza un monto de cero o negativo", async () => {
    const { recordPayment } = await import("@/server/billing");
    const r = await recordPayment("org_1", "enr_1", {
      amount: 0,
      paidAt: new Date(),
      method: "efectivo",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_amount");
    expect(inserts).toHaveLength(0);
  });

  /**
   * FR-004 — el pago hereda la moneda de SU cuota, no la de la inscripción.
   * Sin esto, un alumno paraguayo con una cuota en guaraníes podría quedar
   * con un pago en pesos y el saldo mentiría.
   */
  it("el pago toma la moneda de la cuota, no la de la inscripción", async () => {
    selectQueue.push(
      [{ id: "enr_1", currency: "UYU" }], // inscripción en pesos
      [{ id: "inst_1", enrollmentId: "enr_1", currency: "PYG", amount: 1_000_000 }]
    );
    const { recordPayment } = await import("@/server/billing");
    const r = await recordPayment("org_1", "enr_1", {
      installmentId: "inst_1",
      amount: 500_000,
      paidAt: new Date(),
      method: "transferencia",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.currency).toBe("PYG");
  });

  it("rechaza una cuota que no pertenece a la inscripción", async () => {
    selectQueue.push(
      [{ id: "enr_1", currency: "UYU" }],
      [{ id: "inst_x", enrollmentId: "enr_OTRA", currency: "UYU", amount: 1000 }]
    );
    const { recordPayment } = await import("@/server/billing");
    const r = await recordPayment("org_1", "enr_1", {
      installmentId: "inst_x",
      amount: 500,
      paidAt: new Date(),
      method: "efectivo",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid_installment");
  });

  /**
   * FR-011 — doble click en "Registrar pago" no puede cobrar dos veces.
   * El segundo POST con la misma clave devuelve el pago ya creado.
   */
  it("con la misma idempotencyKey devuelve el pago existente sin insertar", async () => {
    selectQueue.push([
      {
        id: "pay_existente",
        installmentId: "inst_1",
        amount: 12000,
        currency: "UYU",
        paidAt: new Date(),
        method: "transferencia",
        receiptNumber: null,
        notes: null,
        voidedAt: null,
        voidReason: null,
      },
    ]);
    const { recordPayment } = await import("@/server/billing");
    const r = await recordPayment("org_1", "enr_1", {
      amount: 12000,
      paidAt: new Date(),
      method: "transferencia",
      idempotencyKey: "misma-clave",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("pay_existente");
    expect(inserts).toHaveLength(0);
  });
});

describe("listInstallments — saldos derivados", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    inserts.length = 0;
    vi.resetModules();
  });

  it("el pago parcial deja saldo y el anulado NO cuenta", async () => {
    const dueDate = new Date("2026-12-01");
    selectQueue.push(
      [
        { id: "inst_1", number: 1, dueDate, amount: 19000, currency: "UYU", canceledAt: null, notes: null },
      ],
      [
        { id: "p1", installmentId: "inst_1", amount: 12000, voidedAt: null },
        // Este está anulado: no debe descontar del saldo.
        { id: "p2", installmentId: "inst_1", amount: 7000, voidedAt: new Date() },
      ]
    );
    const { listInstallments } = await import("@/server/billing");
    const rows = await listInstallments("org_1", "enr_1", new Date("2026-11-01"));
    expect(rows[0]!.paid).toBe(12000);
    expect(rows[0]!.balance).toBe(7000);
    expect(rows[0]!.status).toBe("parcial");
  });
});
