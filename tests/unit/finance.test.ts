import { describe, expect, it, vi } from "vitest";

/**
 * 005 (T038, US6, FR-019, FR-016): `monthlyRevenue` calcula el total del mes
 * actual vs. el anterior; `GET /api/dashboard/finance` responde 403 para
 * `role: "soporte"` (integración con `requireFullAccess`, T004/T005) y 200
 * con el total para acceso completo.
 *
 * 007 (corrección) — los totales van SEPARADOS POR MONEDA. Antes se sumaba
 * `enrollment.amount` sin mirar `enrollment.currency`, así que una cohorte
 * cobrada en guaraníes y otra en dólares terminaban en el mismo número: el
 * panel mostraba una cifra que no significaba nada. Sumar monedas distintas
 * exige un tipo de cambio, y el CRM no tiene ninguno (ni debe inventarlo).
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
    selectQueue.push(
      [{ currency: "UYU", total: "150000" }],
      [{ currency: "UYU", total: "90000" }]
    );
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-08-15"));

    expect(dashboard.currentMonth.month).toBe("2026-08");
    expect(dashboard.previousMonth.month).toBe("2026-07");
    expect(dashboard.currentMonth.totals).toContainEqual({
      currency: "UYU",
      total: 150000,
    });
    expect(dashboard.previousMonth.totals).toContainEqual({
      currency: "UYU",
      total: 90000,
    });
  });

  it("007 — NUNCA mezcla monedas: cada una lleva su propio total", async () => {
    // El mes trae inscripciones en las tres monedas. 150000 UYU + 1200 USD no
    // son 151200 de nada: tienen que quedar en filas distintas.
    selectQueue.push(
      [
        { currency: "UYU", total: "150000" },
        { currency: "USD", total: "1200" },
        { currency: "PYG", total: "4000000" },
      ],
      []
    );
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-08-15"));

    expect(dashboard.currentMonth.totals).toEqual([
      { currency: "UYU", total: 150000 },
      { currency: "PYG", total: 4000000 },
      { currency: "USD", total: 1200 },
    ]);
  });

  it("007 — una moneda sin inscripciones queda en 0, y el orden es estable", async () => {
    selectQueue.push([{ currency: "USD", total: "500" }], []);
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-08-15"));

    // Orden fijo (CURRENCIES) para que el panel y el gráfico no bailen entre
    // meses según qué moneda tuvo ventas.
    expect(dashboard.currentMonth.totals.map((t) => t.currency)).toEqual([
      "UYU",
      "PYG",
      "USD",
    ]);
    expect(dashboard.currentMonth.totals).toContainEqual({
      currency: "UYU",
      total: 0,
    });
  });

  it("sin inscripciones en un mes, los totales son 0 (no null)", async () => {
    selectQueue.push([{ currency: "UYU", total: null }], []);
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-08-15"));

    expect(dashboard.currentMonth.totals.every((t) => t.total === 0)).toBe(true);
    expect(dashboard.previousMonth.totals.every((t) => t.total === 0)).toBe(true);
  });

  it("enero: el mes anterior es diciembre del año previo", async () => {
    selectQueue.push([], []);
    const { monthlyRevenue } = await import("@/server/finance");

    const dashboard = await monthlyRevenue("org_1", new Date("2026-01-10"));

    expect(dashboard.currentMonth.month).toBe("2026-01");
    expect(dashboard.previousMonth.month).toBe("2025-12");
  });
});

describe("revenueTrend (005 iteración 2, home con gráficos)", () => {
  it("devuelve un punto por mes, en orden cronológico, con sus totales por moneda", async () => {
    // 3 meses: cada uno hace 1 select (sumByCurrencyInRange), en orden.
    selectQueue.push(
      [{ currency: "UYU", total: "10000" }],
      [{ currency: "UYU", total: "20000" }],
      [
        { currency: "UYU", total: "30000" },
        { currency: "USD", total: "400" },
      ]
    );
    const { revenueTrend } = await import("@/server/finance");

    const points = await revenueTrend("org_1", 3, new Date("2026-08-15"));

    expect(points.map((p) => p.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(points[2]?.totals).toContainEqual({ currency: "USD", total: 400 });
    expect(points[0]?.totals).toContainEqual({ currency: "USD", total: 0 });
  });

  it("sin facturación, cada mes queda en 0 (no null)", async () => {
    selectQueue.push([], []);
    const { revenueTrend } = await import("@/server/finance");

    const points = await revenueTrend("org_1", 2, new Date("2026-08-15"));

    expect(points.every((p) => p.totals.every((t) => t.total === 0))).toBe(true);
  });
});

describe("activeCurrencies (007 — qué monedas mostrar)", () => {
  it("devuelve solo las monedas con movimiento en la ventana", async () => {
    const { activeCurrencies } = await import("@/server/finance");

    const currencies = activeCurrencies([
      {
        month: "2026-07",
        totals: [
          { currency: "UYU", total: 0 },
          { currency: "PYG", total: 0 },
          { currency: "USD", total: 0 },
        ],
      },
      {
        month: "2026-08",
        totals: [
          { currency: "UYU", total: 150000 },
          { currency: "PYG", total: 0 },
          { currency: "USD", total: 1200 },
        ],
      },
    ]);

    expect(currencies).toEqual(["UYU", "USD"]);
  });

  it("sin ningún movimiento cae en UYU, para no dejar el panel sin moneda", async () => {
    const { activeCurrencies } = await import("@/server/finance");

    expect(activeCurrencies([])).toEqual(["UYU"]);
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

  it("responde 200 con los totales por moneda para acceso completo", async () => {
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
    selectQueue.push([{ currency: "UYU", total: "100000" }], [
      { currency: "UYU", total: "50000" },
    ]);

    const { GET } = await import("@/app/api/dashboard/finance/route");
    const res = await GET();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      currentMonth: { totals: { currency: string; total: number }[] };
      previousMonth: { totals: { currency: string; total: number }[] };
      currencies: string[];
    };
    expect(body.currentMonth.totals).toContainEqual({
      currency: "UYU",
      total: 100000,
    });
    expect(body.previousMonth.totals).toContainEqual({
      currency: "UYU",
      total: 50000,
    });
    // El panel necesita saber qué monedas tienen movimiento sin recalcularlo.
    expect(body.currencies).toEqual(["UYU"]);
  });
});
