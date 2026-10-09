import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";

/**
 * Crear-roles — Asignar roles desde Equipo.
 *
 * Tres reglas, y las tres cierran una puerta concreta:
 * - **sin escalada**: quien gestiona accesos no puede dar (al crear una cuenta
 *   o al cambiarle el rol) un rol con capacidades que él no tiene, ni tocar
 *   a alguien que tiene más que él;
 * - **no a uno mismo**: cambiarte tu propio rol es la forma más corta de
 *   quedar encerrado afuera o de subirte de categoría;
 * - **siempre alguien a cargo**: la organización no puede quedar sin una
 *   cuenta que configure y que gestione accesos, porque esa es la cuenta que
 *   arregla todo lo demás.
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
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    update: () => ({
      set: (values: unknown) => {
        updates.push(values);
        return { where: () => ({ returning: () => Promise.resolve([{ id: "mem_b", ...(values as object) }]) }) };
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

const SIN_PLATA = CAPABILITIES.filter((c) => !c.startsWith("cobranza."));

const ROLES = [
  { id: "rol_dir", key: "direccion", name: "Dirección", capabilities: CAPABILITIES, system: true },
  { id: "rol_coo", key: "coordinacion", name: "Coordinación", capabilities: SIN_PLATA, system: true },
  {
    id: "rol_aca",
    key: "rol_aca",
    name: "Coordinación académica",
    capabilities: ["academico.ver", "asistencia.editar"],
    system: false,
  },
];

const ACTOR_DIR = { userId: "usr_a", capabilities: CAPABILITIES as readonly Capability[] };
const ACTOR_COO = { userId: "usr_a", capabilities: SIN_PLATA as readonly Capability[] };

const miembro = (id: string, userId: string, role: string) => ({ id, userId, role, organizationId: "org_1" });

beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
  vi.resetModules();
});

describe("assignableRoles", () => {
  it("marca como asignables solo los roles que no exceden a quien mira", async () => {
    selectQueue.push(ROLES);
    const { assignableRoles } = await import("@/server/team");
    const r = await assignableRoles("org_1", SIN_PLATA);
    expect(r.map((x) => [x.key, x.assignable])).toEqual([
      ["direccion", false],
      ["coordinacion", true],
      ["rol_aca", true],
    ]);
    // Lo que viaja es lo justo para elegir: sin la matriz de capacidades.
    expect(r[0]).not.toHaveProperty("capabilities");
  });
});

describe("resolveRoleForNewMember", () => {
  it("acepta un rol que no excede a quien da el alta", async () => {
    selectQueue.push(ROLES);
    const { resolveRoleForNewMember } = await import("@/server/team");
    const r = await resolveRoleForNewMember("org_1", SIN_PLATA, "rol_aca");
    expect(r.ok).toBe(true);
  });

  it("rechaza con 403 un rol con capacidades que quien da el alta no tiene", async () => {
    selectQueue.push(ROLES);
    const { resolveRoleForNewMember } = await import("@/server/team");
    const r = await resolveRoleForNewMember("org_1", SIN_PLATA, "direccion");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.code).toBe("escalation");
  });

  it("rechaza con 422 un rol que no existe", async () => {
    selectQueue.push(ROLES);
    const { resolveRoleForNewMember } = await import("@/server/team");
    const r = await resolveRoleForNewMember("org_1", CAPABILITIES, "inventado");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.code).toBe("invalid_role");
  });
});

describe("changeMemberRole", () => {
  it("cambia el rol de otra cuenta", async () => {
    selectQueue.push([miembro("mem_b", "usr_b", "coordinacion")]);
    selectQueue.push(ROLES);
    selectQueue.push([miembro("mem_a", "usr_a", "direccion"), miembro("mem_b", "usr_b", "coordinacion")]);
    const { changeMemberRole } = await import("@/server/team");
    const r = await changeMemberRole("org_1", ACTOR_DIR, "mem_b", "rol_aca");
    expect(r.ok).toBe(true);
    expect(updates).toEqual([{ role: "rol_aca" }]);
  });

  it("no deja cambiarte tu propio rol", async () => {
    selectQueue.push([miembro("mem_a", "usr_a", "direccion")]);
    const { changeMemberRole } = await import("@/server/team");
    const r = await changeMemberRole("org_1", ACTOR_DIR, "mem_a", "rol_aca");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("self_change");
    expect(updates).toHaveLength(0);
  });

  it("no deja asignar un rol con capacidades que quien asigna no tiene", async () => {
    selectQueue.push([miembro("mem_b", "usr_b", "rol_aca")]);
    selectQueue.push(ROLES);
    const { changeMemberRole } = await import("@/server/team");
    const r = await changeMemberRole("org_1", ACTOR_COO, "mem_b", "rol_dir");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.code).toBe("escalation");
    expect(updates).toHaveLength(0);
  });

  /**
   * La contracara de la escalada: bajar de rol a alguien que puede más que
   * vos también es usar un poder que no tenés.
   */
  it("no deja cambiarle el rol a alguien que tiene capacidades que quien asigna no tiene", async () => {
    selectQueue.push([miembro("mem_b", "usr_b", "direccion")]);
    selectQueue.push(ROLES);
    const { changeMemberRole } = await import("@/server/team");
    const r = await changeMemberRole("org_1", ACTOR_COO, "mem_b", "rol_aca");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(r.code).toBe("escalation");
    expect(updates).toHaveLength(0);
  });

  it("no deja la organización sin nadie que configure y gestione accesos", async () => {
    // La única cuenta de Dirección es la que se cambia; quien actúa tiene un
    // rol con todo salvo configurar, así que no cuenta como "a cargo".
    const sinConfig = CAPABILITIES.filter((c) => c !== "configuracion.editar");
    const roles = [
      ...ROLES,
      { id: "rol_acc", key: "rol_acc", name: "Accesos", capabilities: sinConfig, system: false },
    ];
    selectQueue.push([miembro("mem_b", "usr_b", "direccion")]);
    selectQueue.push(roles);
    selectQueue.push([miembro("mem_a", "usr_a", "rol_acc"), miembro("mem_b", "usr_b", "direccion")]);
    const { changeMemberRole } = await import("@/server/team");
    const r = await changeMemberRole(
      "org_1",
      { userId: "usr_a", capabilities: CAPABILITIES },
      "mem_b",
      "rol_aca"
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.code).toBe("last_admin");
    expect(updates).toHaveLength(0);
  });

  it("un miembro o un rol inexistente responde 404", async () => {
    selectQueue.push([]);
    const { changeMemberRole } = await import("@/server/team");
    const sinMiembro = await changeMemberRole("org_1", ACTOR_DIR, "mem_x", "rol_aca");
    expect(sinMiembro.ok).toBe(false);
    if (!sinMiembro.ok) expect(sinMiembro.status).toBe(404);

    selectQueue.push([miembro("mem_b", "usr_b", "coordinacion")]);
    selectQueue.push(ROLES);
    const sinRol = await changeMemberRole("org_1", ACTOR_DIR, "mem_b", "rol_x");
    expect(sinRol.ok).toBe(false);
    if (!sinRol.ok) expect(sinRol.status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});
