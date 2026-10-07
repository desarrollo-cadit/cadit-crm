import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-10-07 — `GET /api/contacts/[id]/admin-activity` exige
 * `alumnos.auditoria`, y la sesión sin ella **no llega a consultar la base**.
 * Mismo patrón que `finanzas-api.test.ts`: el doble cuenta las consultas.
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
  getDb: () => ({ select: () => thenableChain(selectQueue.shift() ?? []) }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

function mockSession(session: Record<string, unknown>) {
  vi.doMock("@/lib/auth/session", () => {
    class UnauthorizedError extends Error {}
    return {
      UnauthorizedError,
      requireSession: vi.fn().mockResolvedValue({
        userId: "usr_1",
        organizationId: "org_1",
        ...session,
      }),
    };
  });
}

const ctx = { params: Promise.resolve({ id: "ct_1" }) };
const req = () => new Request("http://localhost/api/contacts/ct_1/admin-activity");

type Route = { GET: (req: Request, ctx: unknown) => Promise<Response> };

describe("la actividad administrativa del alumno", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    vi.resetModules();
  });

  it("soporte recibe 403 sin tocar la base", async () => {
    mockSession({ role: "soporte" });
    const mod = (await import("@/app/api/contacts/[id]/admin-activity/route")) as Route;
    const res = await mod.GET(req(), ctx);
    expect(res.status).toBe(403);
    expect(selectQueue).toHaveLength(0);
  });

  it("un rol de base con `contactos.ver` pero sin `alumnos.auditoria` tampoco entra", async () => {
    mockSession({ role: "coordinacion", capabilities: ["contactos.ver", "cobranza.ver"] });
    const mod = (await import("@/app/api/contacts/[id]/admin-activity/route")) as Route;
    const res = await mod.GET(req(), ctx);
    expect(res.status).toBe(403);
  });

  it("con la capacidad entra, y un contacto ajeno o inexistente es 404", async () => {
    mockSession({ role: "direccion", capabilities: ["alumnos.auditoria"] });
    selectQueue.push([]); // el contacto no está en esta organización
    const mod = (await import("@/app/api/contacts/[id]/admin-activity/route")) as Route;
    const res = await mod.GET(req(), ctx);
    expect(res.status).toBe(404);
  });
});
