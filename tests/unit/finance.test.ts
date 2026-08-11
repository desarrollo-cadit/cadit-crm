import { describe, expect, it, vi } from "vitest";

/**
 * 005 (T038, US6, FR-019, FR-016): `monthlyRevenue` calcula el total del mes
 * actual vs. el anterior; `GET /api/dashboard/finance` responde 403 para
 * `role: "soporte"` (integración con `requireFullAccess`, T004/T005) y 200
 * con el total para acceso completo.
 */

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
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
        ),
    }
  ),
}));

describe("monthlyRevenue (T036, FR-019)", () => {
  it("suma el mes actual y el anterior por separado", async () => {
    selectQueue.push([{ total: "150000" }], [{ total: "90000" }]);
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-08-15"));

    expect(dashboard.currentMonth).toEqual({ month: "2026-08", total: 150000 });
    expect(dashboard.previousMonth).toEqual({ month: "2026-07", total: 90000 });
  });

  it("sin inscripciones en un mes, el total es 0 (no null)", async () => {
    selectQueue.push([{ total: null }], [{ total: null }]);
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-08-15"));

    expect(dashboard.currentMonth.total).toBe(0);
    expect(dashboard.previousMonth.total).toBe(0);
  });

  it("enero: el mes anterior es diciembre del año previo", async () => {
    selectQueue.push([{ total: "0" }], [{ total: "0" }]);
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-01-10"));

    expect(dashboard.currentMonth.month).toBe("2026-01");
    expect(dashboard.previousMonth.month).toBe("2025-12");
  });
});

describe("revenueTrend (005 iteración 2, home con gráficos)", () => {
  it("devuelve un punto por mes, en orden cronológico, reusando sumAmountInRange", async () => {
    // 3 meses: cada uno hace 1 select (sumAmountInRange), en orden.
    selectQueue.push(
      [{ total: "10000" }],
      [{ total: "20000" }],
      [{ total: "30000" }]
    );
    const { revenueTrend } = await import("@/server/finance");

    const points = await revenueTrend("org_1", 3, new Date("2026-08-15"));

    expect(points).toEqual([
      { month: "2026-06", total: 10000 },
      { month: "2026-07", total: 20000 },
      { month: "2026-08", total: 30000 },
    ]);
  });

  it("sin facturación, cada mes queda en 0 (no null)", async () => {
    selectQueue.push([{ total: null }], [{ total: null }]);
    const { revenueTrend } = await import("@/server/finance");

    const points = await revenueTrend("org_1", 2, new Date("2026-08-15"));

    expect(points.every((p) => p.total === 0)).toBe(true);
  });
});

describe("GET /api/dashboard/finance (T037, FR-016, integración con requireFullAccess)", () => {
  it("responde 403 forbidden para role: 'soporte' sin calcular nada", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => {
      class UnauthorizedError extends Error {}
      return {
        UnauthorizedError,
        requireSession: vi.fn().mockResolvedValue({
          userId: "usr_1",
          organizationId: "org_1",
          role: "soporte",
        }),
      };
    });

    const { GET } = await import("@/app/api/dashboard/finance/route");
    const res = await GET();

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("forbidden");
    expect(selectQueue).toHaveLength(0); // nunca llegó a consultar la BD
  });

  it("responde 200 con el total para acceso completo", async () => {
    vi.resetModules();
    vi.doMock("@/lib/auth/session", () => {
      class UnauthorizedError extends Error {}
      return {
        UnauthorizedError,
        requireSession: vi.fn().mockResolvedValue({
          userId: "usr_1",
          organizationId: "org_1",
          role: "member",
        }),
      };
    });
    selectQueue.push([{ total: "100000" }], [{ total: "50000" }]);

    const { GET } = await import("@/app/api/dashboard/finance/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currentMonth: { total: number };
      previousMonth: { total: number };
    };
    expect(body.currentMonth.total).toBe(100000);
    expect(body.previousMonth.total).toBe(50000);
  });
});
