import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 042 — Las dos escrituras de `facturacion.editar`. Lo que se prueba es la
 * frontera: el `set` que llega a la base lleva SOLO columnas de documento
 * (número + quién y cuándo), nunca monto, moneda, cuotas ni pagos.
 */

const updates: { table: unknown; set: Record<string, unknown> }[] = [];
const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({}),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () => Promise.resolve([{ id: "x", ...set }]),
          }),
        };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const COLUMNAS_FACTURA = ["invoiceNumber", "invoiceRecordedAt", "invoiceRecordedBy", "updatedAt"];
const COLUMNAS_RECIBO = ["receiptNumber", "receiptRecordedAt", "receiptRecordedBy"];

const madre = {
  id: "en_1",
  contactId: "ct_1",
  companyId: null,
  parentEnrollmentId: null,
  invoiceNumber: null,
};

beforeEach(() => {
  updates.length = 0;
  selectQueue.length = 0;
});

describe("registrarFactura", () => {
  it("guarda el número recortado, con autor y fecha, y NADA más", async () => {
    selectQueue.push([madre], []);
    const { registrarFactura } = await import("@/server/facturacion");
    const r = await registrarFactura("org_1", "en_1", "  F-0819 ", "usr_admin");

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set;
    expect(Object.keys(set).sort()).toEqual([...COLUMNAS_FACTURA].sort());
    expect(set.invoiceNumber).toBe("F-0819");
    expect(set.invoiceRecordedBy).toBe("usr_admin");
    expect(set.invoiceRecordedAt).toBeInstanceOf(Date);
    if (r.ok) expect(r.aviso).toBeNull();
  });

  it("borrar es una corrección: deja el número en NULL y registra quién", async () => {
    selectQueue.push([{ ...madre, invoiceNumber: "F-1" }]);
    const { registrarFactura } = await import("@/server/facturacion");
    const r = await registrarFactura("org_1", "en_1", "   ", "usr_admin");

    expect(r.ok).toBe(true);
    expect(updates[0]!.set.invoiceNumber).toBeNull();
    expect(updates[0]!.set.invoiceRecordedBy).toBe("usr_admin");
  });

  it("el mismo número que ya tenía no reescribe al autor", async () => {
    selectQueue.push([{ ...madre, invoiceNumber: "F-1" }]);
    const { registrarFactura } = await import("@/server/facturacion");
    const r = await registrarFactura("org_1", "en_1", " F-1", "usr_otro");

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(0);
  });

  it("número repetido en otra persona → guarda igual y devuelve el aviso", async () => {
    selectQueue.push([madre], [{ contactId: "ct_2", companyId: null, firstName: "Bruno", lastName: "Gómez" }]);
    const { registrarFactura } = await import("@/server/facturacion");
    const r = await registrarFactura("org_1", "en_1", "F-9", "usr_admin");

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
    if (r.ok) expect(r.aviso).toMatch(/Bruno Gómez/);
  });

  it("una inscripción hija → 422: la factura va en la madre, que lleva la plata", async () => {
    selectQueue.push([{ ...madre, parentEnrollmentId: "en_madre" }]);
    const { registrarFactura } = await import("@/server/facturacion");
    const r = await registrarFactura("org_1", "en_1", "F-1", "usr_admin");

    expect(r).toMatchObject({ ok: false, status: 422, code: "factura_en_la_madre" });
    expect(updates).toHaveLength(0);
  });

  it("inexistente (u otra organización) → 404", async () => {
    selectQueue.push([]);
    const { registrarFactura } = await import("@/server/facturacion");
    const r = await registrarFactura("org_1", "en_x", "F-1", "usr_admin");
    expect(r).toMatchObject({ ok: false, status: 404, code: "not_found" });
    expect(updates).toHaveLength(0);
  });

  it("la respuesta no lleva plata", async () => {
    selectQueue.push([madre], []);
    const { registrarFactura } = await import("@/server/facturacion");
    const r = await registrarFactura("org_1", "en_1", "F-1", "usr_admin");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.factura).sort()).toEqual(["enrollmentId", "invoiceNumber", "invoiceRecordedAt"]);
    }
  });
});

describe("registrarRecibo", () => {
  it("guarda el número del recibo del PAGO (DV-006 de 008), con autor, y nada más", async () => {
    selectQueue.push([{ id: "pay_1", voidedAt: null, receiptNumber: null }]);
    const { registrarRecibo } = await import("@/server/facturacion");
    const r = await registrarRecibo("org_1", "pay_1", " R-77 ", "usr_admin");

    expect(r.ok).toBe(true);
    const set = updates[0]!.set;
    expect(Object.keys(set).sort()).toEqual([...COLUMNAS_RECIBO].sort());
    expect(set.receiptNumber).toBe("R-77");
    expect(set.receiptRecordedBy).toBe("usr_admin");
  });

  it("un pago anulado no se toca → 409", async () => {
    selectQueue.push([{ id: "pay_1", voidedAt: new Date(), receiptNumber: null }]);
    const { registrarRecibo } = await import("@/server/facturacion");
    const r = await registrarRecibo("org_1", "pay_1", "R-1", "usr_admin");
    expect(r).toMatchObject({ ok: false, status: 409, code: "pago_anulado" });
    expect(updates).toHaveLength(0);
  });

  it("inexistente → 404", async () => {
    selectQueue.push([]);
    const { registrarRecibo } = await import("@/server/facturacion");
    const r = await registrarRecibo("org_1", "pay_x", "R-1", "usr_admin");
    expect(r).toMatchObject({ ok: false, status: 404 });
  });
});
