import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 026 (FR-021, SC-007) — El front oculta, el servidor prohíbe.
 *
 * Lo que se verifica no es sólo el 403: es que la sesión sin `cobranza.ver`
 * **no llega a consultar la base**. Un 403 devuelto después de leer la caja
 * del mes ya expuso el dato al proceso, que es exactamente lo que
 * `requireCapability` corta antes de abrir siquiera la transacción.
 *
 * Mismo patrón que `billing-api.test.ts` (008/T011): el doble de `@/lib/db`
 * cuenta las consultas, así que si el gate se corriera al lugar equivocado la
 * cola dejaría de estar vacía.
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
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
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

const RUTAS = ["@/app/api/finanzas/cierre/route"] as const;

describe("026 — el cierre de período exige `cobranza.ver`", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    vi.resetModules();
  });

  it.each(RUTAS)("%s: soporte recibe 403 sin tocar la base", async (ruta) => {
    mockRole("soporte");
    const mod = (await import(ruta)) as {
      GET: (req: Request) => Promise<Response>;
    };
    const res = await mod.GET(new Request("http://localhost/api/finanzas/cierre"));

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("forbidden");
    // `cobranza.ver` es una de las tres FINANCIAL_CAPABILITIES: el texto del
    // 403 es el financiero, no el genérico.
    expect(body.error.message).toBe("Sin acceso a datos financieros");
    expect(selectQueue, "el handler llegó a consultar la base").toHaveLength(0);
  });

  /**
   * Un 403 devuelto a todo el mundo pasaría el caso de arriba sin proteger
   * nada. Este es el que distingue "cerrado" de "roto".
   */
  it.each(RUTAS)("%s: un rol con la capacidad SÍ entra", async (ruta) => {
    vi.doMock("@/lib/auth/session", () => {
      class UnauthorizedError extends Error {}
      return {
        UnauthorizedError,
        requireSession: vi.fn().mockResolvedValue({
          userId: "usr_1",
          organizationId: "org_1",
          role: "administracion",
          capabilities: [
            "cobranza.ver",
            "inscripciones.ver",
            "academico.ver",
            "contactos.ver",
          ],
        }),
      };
    });
    const mod = (await import(ruta)) as {
      GET: (req: Request) => Promise<Response>;
    };
    const res = await mod.GET(
      new Request("http://localhost/api/finanzas/cierre?mes=2026-08")
    );
    expect(res.status).toBe(200);
  });

  /**
   * FR-019 — Ningún endpoint de esta fase devuelve un archivo. La decisión 1
   * de la fase es que se MIRA y se transcribe: un export con formato es un
   * contrato con un sistema que no controlamos.
   */
  it.each(RUTAS)("%s: responde JSON, nunca un archivo", async (ruta) => {
    vi.doMock("@/lib/auth/session", () => {
      class UnauthorizedError extends Error {}
      return {
        UnauthorizedError,
        requireSession: vi.fn().mockResolvedValue({
          userId: "usr_1",
          organizationId: "org_1",
          role: "direccion",
          capabilities: ["cobranza.ver"],
        }),
      };
    });
    const mod = (await import(ruta)) as {
      GET: (req: Request) => Promise<Response>;
    };
    const res = await mod.GET(
      new Request("http://localhost/api/finanzas/cierre?mes=2026-08")
    );
    const tipo = res.headers.get("content-type") ?? "";
    expect(tipo).toContain("application/json");
    expect(tipo).not.toContain("text/csv");
    expect(res.headers.get("content-disposition")).toBeNull();
  });
});
