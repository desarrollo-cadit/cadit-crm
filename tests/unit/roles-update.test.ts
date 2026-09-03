import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 012 (T020) — El guardarraíl de la pantalla de roles.
 *
 * La pantalla de roles exige `configuracion.editar`. Si la dueña se la quita a
 * su propio rol, pierde la única puerta para devolvérsela: el error se vuelve
 * irreversible desde la interfaz y hay que entrar a la base a mano.
 *
 * No se bloquea "editar roles" en general —recortarle permisos a OTRO rol es
 * una decisión legítima y reversible—. Se bloquea exactamente el movimiento
 * que no tiene vuelta.
 */

const selectQueue: unknown[][] = [];
const updates: unknown[] = [];

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
    update: () => ({
      set: (values: unknown) => {
        updates.push(values);
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: "rol_1",
                  key: "direccion",
                  name: "Dirección",
                  system: true,
                  ...(values as Record<string, unknown>),
                },
              ]),
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

const ROL_DIRECCION = {
  id: "rol_1",
  organizationId: "org_1",
  key: "direccion",
  name: "Dirección",
  capabilities: ["configuracion.editar", "academico.ver"],
  system: true,
};

describe("updateRoleCapabilities — no podés encerrarte afuera", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    updates.length = 0;
    vi.resetModules();
  });

  it("rechaza quitarle `configuracion.editar` a TU PROPIO rol", async () => {
    selectQueue.push([ROL_DIRECCION]);

    const { updateRoleCapabilities } = await import("@/server/roles");
    const r = await updateRoleCapabilities("org_1", "rol_1", "direccion", [
      "academico.ver",
    ]);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("self_lockout");
    expect(r.status).toBe(422);
    // Y sobre todo: no llegó a escribir.
    expect(updates).toHaveLength(0);
  });

  /**
   * La contracara, y es la que evita que el guardarraíl se vuelva una jaula:
   * recortar OTRO rol se permite. Sin este caso, el test de arriba también
   * pasaría con una función que rechaza todo.
   */
  it("permite quitársela a un rol que NO es el tuyo", async () => {
    selectQueue.push([{ ...ROL_DIRECCION, key: "coordinacion" }]);
    selectQueue.push([]); // conteo de miembros

    const { updateRoleCapabilities } = await import("@/server/roles");
    const r = await updateRoleCapabilities("org_1", "rol_1", "direccion", [
      "academico.ver",
    ]);

    expect(r.ok).toBe(true);
    expect(updates).toHaveLength(1);
  });

  it("permite cualquier otro recorte sobre tu propio rol", async () => {
    selectQueue.push([ROL_DIRECCION]);
    selectQueue.push([]);

    const { updateRoleCapabilities } = await import("@/server/roles");
    const r = await updateRoleCapabilities("org_1", "rol_1", "direccion", [
      "configuracion.editar",
    ]);

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.capabilities).toEqual(["configuracion.editar"]);
  });

  /**
   * DV-003 — La base guarda `jsonb`, que es texto sin tipo. Una capacidad
   * inventada no puede entrar por ahí: se descarta antes de guardar.
   */
  it("descarta capacidades inventadas antes de escribir", async () => {
    selectQueue.push([{ ...ROL_DIRECCION, key: "coordinacion" }]);
    selectQueue.push([]);

    const { updateRoleCapabilities } = await import("@/server/roles");
    const r = await updateRoleCapabilities("org_1", "rol_1", "direccion", [
      "academico.ver",
      "borrar.la.base",
    ]);

    expect(r.ok).toBe(true);
    const escrito = updates[0] as { capabilities: string[] };
    expect(escrito.capabilities).toEqual(["academico.ver"]);
  });

  it("un rol inexistente responde 404 y no escribe", async () => {
    selectQueue.push([]);

    const { updateRoleCapabilities } = await import("@/server/roles");
    const r = await updateRoleCapabilities("org_1", "rol_fantasma", "direccion", []);

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});
