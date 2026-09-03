import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 008 (T011) — El gate de rol de la cobranza, con el mismo patrón que el test
 * de `/api/dashboard/finance` (T038).
 *
 * Lo que se verifica no es solo el 403: es que soporte **no llega a consultar
 * la base**. Un 403 devuelto después de leer las cuotas ya expuso el dato al
 * proceso; el corte tiene que ocurrir antes.
 */

const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
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
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([{}]) }) }),
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

function mockRole(role: string) {
  vi.doMock("@/lib/auth/session", () => {
    class UnauthorizedError extends Error {}
    return {
      UnauthorizedError,
      requireSession: vi.fn().mockResolvedValue({
        userId: "usr_1",
        organizationId: "org_1",
        role,
      }),
    };
  });
}

const ctx = { params: Promise.resolve({ id: "enr_1" }) };

describe("cobranza — gate de rol (FR-016, DV-005)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    vi.resetModules();
  });

  it("GET de cuotas: soporte recibe 403 sin tocar la base", async () => {
    mockRole("soporte");
    const { GET } = await import("@/app/api/enrollments/[id]/installments/route");
    const res = await GET(new Request("http://localhost/x"), ctx);

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
    expect(selectQueue).toHaveLength(0);
  });

  it("POST de pago: soporte recibe 403 sin tocar la base", async () => {
    mockRole("soporte");
    const { POST } = await import("@/app/api/enrollments/[id]/payments/route");
    const res = await POST(
      new Request("http://localhost/x", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          amount: 1000,
          paidAt: "2026-08-24",
          method: "efectivo",
        }),
      }),
      ctx
    );

    expect(res.status).toBe(403);
    expect(selectQueue).toHaveLength(0);
  });

  it("morosidad: soporte recibe 403 sin tocar la base", async () => {
    mockRole("soporte");
    const { GET } = await import("@/app/api/dashboard/overdue/route");
    const res = await GET(new Request("http://localhost/api/dashboard/overdue"));

    expect(res.status).toBe(403);
    expect(selectQueue).toHaveLength(0);
  });

  /**
   * La contracara: con acceso completo la ruta SÍ consulta. Sin este caso, un
   * 403 devuelto a todo el mundo pasaría los tres tests de arriba.
   */
  it("con acceso completo, el GET de cuotas sí consulta la base", async () => {
    mockRole("member");
    selectQueue.push([], []); // cuotas y pagos, ambos vacíos
    const { GET } = await import("@/app/api/enrollments/[id]/installments/route");
    const res = await GET(new Request("http://localhost/x"), ctx);

    expect(res.status).toBe(200);
    expect(selectQueue).toHaveLength(0); // se consumieron las dos consultas
  });
});
