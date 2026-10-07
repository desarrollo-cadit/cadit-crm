import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 2026-10-07 — Registrar un ingreso al portal NUNCA puede romper el ingreso.
 *
 * El hook corre dentro del login de Better Auth: si lanza, la persona no
 * entra. Por eso lo que se verifica acá no es solo que escriba bien, sino que
 * cualquier fallo —la base caída, una organización rara— se trague con un
 * `console.error` y el login siga.
 */

const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown }[] = [];
const scopes: { organizationId: string; actor: string }[] = [];
let insertFails = false;

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(rows).then(resolve, reject);
  return chain;
}

const fakeDb = {
  select: () => thenableChain(selectQueue.shift() ?? []),
  insert: (table: unknown) => ({
    values: async (values: unknown) => {
      if (insertFails) throw new Error("la base se cayó");
      inserts.push({ table, values });
    },
  }),
};

vi.mock("@/lib/db", () => ({
  getRootDb: () => fakeDb,
  getDb: () => fakeDb,
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({ __table: String(tableName) }, {
          get: (t, col) => (col === "__table" ? t.__table : `${String(tableName)}.${String(col)}`),
        }),
    }
  ),
}));

vi.mock("@/lib/db/with-tenant", () => ({
  withOrganizationScope: async (organizationId: string, actor: string, fn: () => Promise<unknown>) => {
    scopes.push({ organizationId, actor });
    return fn();
  },
}));

const SESION = {
  userId: "usr_1",
  ipAddress: "190.64.1.2",
  userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0.0.0 Safari/537.36",
};

describe("recordPortalSignIn", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    inserts.length = 0;
    scopes.length = 0;
    insertFails = false;
  });

  it("un alumno que entra queda registrado, con su contacto y DENTRO del alcance de su organización", async () => {
    selectQueue.push([
      { organizationId: "org_1", kind: "alumno", contactId: "ct_1", teacherId: null },
    ]);
    const { recordPortalSignIn } = await import("@/server/activity-log");
    await recordPortalSignIn(SESION, "/sign-in/email");

    expect(scopes).toEqual([{ organizationId: "org_1", actor: "usr_1" }]);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toMatchObject({
      organizationId: "org_1",
      contactId: "ct_1",
      userId: "usr_1",
      kind: "portal.sign_in",
      ipAddress: "190.64.1.2",
      metadata: { audience: "alumno" },
    });
    expect((inserts[0]!.values as { id: string }).id).toMatch(/^act_/);
  });

  it("un profesor también, sin contacto y con su `teacherId` en la metadata", async () => {
    selectQueue.push([
      { organizationId: "org_1", kind: "profesor", contactId: null, teacherId: "tch_1" },
    ]);
    const { recordPortalSignIn } = await import("@/server/activity-log");
    await recordPortalSignIn(SESION, "/sign-in/email");
    expect(inserts[0]!.values).toMatchObject({
      contactId: null,
      metadata: { audience: "profesor", teacherId: "tch_1" },
    });
  });

  it("una cuenta sin vínculo de portal (staff) no se registra", async () => {
    selectQueue.push([]);
    const { recordPortalSignIn } = await import("@/server/activity-log");
    await recordPortalSignIn(SESION, "/sign-in/email");
    expect(inserts).toHaveLength(0);
    expect(scopes).toHaveLength(0);
  });

  it("una sesión que no nace de un login (alta, cambio de contraseña) no consulta nada", async () => {
    selectQueue.push([
      { organizationId: "org_1", kind: "alumno", contactId: "ct_1", teacherId: null },
    ]);
    const { recordPortalSignIn } = await import("@/server/activity-log");
    await recordPortalSignIn(SESION, "/sign-up/email");
    expect(inserts).toHaveLength(0);
    expect(selectQueue).toHaveLength(1);
  });

  it("si la escritura falla, NO lanza: el login sigue", async () => {
    selectQueue.push([
      { organizationId: "org_1", kind: "alumno", contactId: "ct_1", teacherId: null },
    ]);
    insertFails = true;
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { recordPortalSignIn } = await import("@/server/activity-log");
    await expect(recordPortalSignIn(SESION, "/sign-in/email")).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
    // Lo que se loguea no lleva la IP ni el user agent: solo el motivo.
    const logueado = JSON.stringify(error.mock.calls);
    expect(logueado).not.toContain("190.64.1.2");
    error.mockRestore();
  });
});
