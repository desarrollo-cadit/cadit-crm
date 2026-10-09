import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, type Capability } from "@/lib/capabilities";

/**
 * 030 (addendum, pedido del dueño) — Un profesor que TAMBIÉN es del equipo.
 *
 * El dueño quiere que un profesor sea además "EBIM manager". Antes el alta
 * del equipo respondía "Ya existe una cuenta con ese correo", porque el
 * profesor ya tiene usuario de portal. Ahora:
 *
 * - correo de un PROFESOR de esta organización → se le agrega una fila de
 *   `member` al MISMO usuario (sin contraseña nueva, sin tocar la suya);
 * - correo de un ALUMNO → se sigue rechazando: el panel no es para alumnos,
 *   y una cuenta que entra a los dos lados mezcla dos audiencias que la
 *   constitución separa;
 * - quitar del equipo borra SOLO la fila de `member`: el portal sigue.
 *
 * Las dos puertas siguen siendo estructurales: la cuenta dual entra al panel
 * porque TIENE `member`, y al portal porque TIENE `account_link`. No hay un
 * `if` que decida por ella.
 */

const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown }[] = [];
const deletes: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) => fn({ execute: async () => [] }),
  }),
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return { onConflictDoNothing: () => Promise.resolve() };
      },
    }),
    delete: (table: unknown) => ({
      where: () => {
        deletes.push(table);
        return { returning: () => Promise.resolve([{ id: "mem_b" }]) };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) => new Proxy({ __table: String(tableName) }, { get: (t, col) => (col === "__table" ? t.__table : `${String(tableName)}.${String(col)}`) }),
    }
  ),
}));

const signUp = vi.fn(async () => ({ userId: "usr_nuevo" }));

const SIN_PLATA = CAPABILITIES.filter((c) => !c.startsWith("cobranza."));
const ROLES = [
  { id: "rol_dir", key: "direccion", name: "Dirección", capabilities: CAPABILITIES, system: true },
  { id: "rol_coo", key: "coordinacion", name: "Coordinación", capabilities: SIN_PLATA, system: true },
  { id: "rol_ebim", key: "ebim_manager", name: "EBIM manager", capabilities: ["academico.ver"], system: false },
];
const DIR = CAPABILITIES as readonly Capability[];

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  deletes.length = 0;
  signUp.mockClear();
  vi.resetModules();
});

describe("qué hacer con un correo que ya tiene cuenta", () => {
  it("profesor sin equipo → adjuntar; profesor ya en el equipo → ya_es_equipo", async () => {
    const { decideExistingAccount } = await import("@/server/team");
    expect(decideExistingAccount({ kinds: ["profesor"], isMember: false })).toBe("adjuntar");
    expect(decideExistingAccount({ kinds: ["profesor"], isMember: true })).toBe("ya_es_equipo");
  });
  it("alumno (aunque también sea profesor) → es_alumno", async () => {
    const { decideExistingAccount } = await import("@/server/team");
    expect(decideExistingAccount({ kinds: ["alumno"], isMember: false })).toBe("es_alumno");
    expect(decideExistingAccount({ kinds: ["alumno", "profesor"], isMember: false })).toBe("es_alumno");
  });
  it("sin vínculo de portal en esta organización → otra_cuenta (o ya_es_equipo si ya es miembro)", async () => {
    const { decideExistingAccount } = await import("@/server/team");
    expect(decideExistingAccount({ kinds: [], isMember: false })).toBe("otra_cuenta");
    expect(decideExistingAccount({ kinds: [], isMember: true })).toBe("ya_es_equipo");
  });
});

describe("addTeamMember", () => {
  const input = { name: "Profe Ana", email: "Ana@Academia.uy", roleKey: "ebim_manager" };

  it("profesor existente: agrega `member` al MISMO usuario, sin alta ni contraseña nueva", async () => {
    selectQueue.push(ROLES, [{ id: "usr_ana" }], [{ kind: "profesor" }], []);
    const { addTeamMember } = await import("@/server/team");
    const r = await addTeamMember("org_1", DIR, { ...input, password: "" }, { signUp });
    expect(r).toEqual({ ok: true, data: { attached: true } });
    expect(signUp).not.toHaveBeenCalled();
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toMatchObject({ organizationId: "org_1", userId: "usr_ana", role: "ebim_manager" });
  });

  it("alumno existente: 409 con mensaje claro, sin tocar nada", async () => {
    selectQueue.push(ROLES, [{ id: "usr_alu" }], [{ kind: "alumno" }], []);
    const { addTeamMember } = await import("@/server/team");
    const r = await addTeamMember("org_1", DIR, { ...input, password: "temporal123" }, { signUp });
    expect(r).toMatchObject({ ok: false, status: 409, code: "es_alumno" });
    expect(!r.ok && r.message).toMatch(/alumno/);
    expect(inserts).toHaveLength(0);
    expect(signUp).not.toHaveBeenCalled();
  });

  it("profesor que ya es del equipo: 409 ya_es_equipo", async () => {
    selectQueue.push(ROLES, [{ id: "usr_ana" }], [{ kind: "profesor" }], [{ id: "mem_ana" }]);
    const { addTeamMember } = await import("@/server/team");
    expect(await addTeamMember("org_1", DIR, { ...input, password: "" }, { signUp })).toMatchObject({
      ok: false,
      status: 409,
      code: "ya_es_equipo",
    });
  });

  it("la regla de escalada vale también al adjuntar un profesor", async () => {
    selectQueue.push(ROLES);
    const { addTeamMember } = await import("@/server/team");
    const r = await addTeamMember(
      "org_1",
      ["academico.ver"] as Capability[],
      { ...input, roleKey: "direccion", password: "" },
      { signUp }
    );
    expect(r).toMatchObject({ ok: false, status: 403, code: "escalation" });
    expect(inserts).toHaveLength(0);
  });

  it("correo nuevo: exige contraseña temporal y da de alta como siempre", async () => {
    selectQueue.push(ROLES, []);
    const { addTeamMember } = await import("@/server/team");
    expect(await addTeamMember("org_1", DIR, { ...input, password: "" }, { signUp })).toMatchObject({
      ok: false,
      status: 422,
      code: "password_required",
    });
    selectQueue.push(ROLES, []);
    const r = await addTeamMember("org_1", DIR, { ...input, password: "temporal123" }, { signUp });
    expect(r).toEqual({ ok: true, data: { attached: false } });
    expect(signUp).toHaveBeenCalledWith({ name: "Profe Ana", email: "Ana@Academia.uy", password: "temporal123" });
    expect(inserts[0]!.values).toMatchObject({ userId: "usr_nuevo", role: "ebim_manager" });
  });

  it("una cuenta que existe sin vínculo en esta organización conserva el rechazo de siempre", async () => {
    selectQueue.push(ROLES, [{ id: "usr_x" }], [], []);
    const { addTeamMember } = await import("@/server/team");
    expect(await addTeamMember("org_1", DIR, { ...input, password: "temporal123" }, { signUp })).toMatchObject({
      ok: false,
      status: 409,
      code: "duplicate",
    });
  });
});

describe("removeMember: quitar del equipo borra SOLO la fila de member", () => {
  const ACTOR = { userId: "usr_a", capabilities: DIR };
  const miembro = (id: string, userId: string, role: string) => ({ id, userId, role, organizationId: "org_1" });

  it("borra la fila de member y nada más (el usuario y su acceso al portal siguen)", async () => {
    selectQueue.push([miembro("mem_b", "usr_b", "ebim_manager")], ROLES, [
      miembro("mem_a", "usr_a", "direccion"),
      miembro("mem_b", "usr_b", "ebim_manager"),
    ]);
    const { removeMember } = await import("@/server/team");
    expect(await removeMember("org_1", ACTOR, "mem_b")).toEqual({ ok: true, data: { id: "mem_b" } });
    expect(deletes).toEqual([expect.objectContaining({ __table: "member" })]);
  });

  it("no a uno mismo", async () => {
    selectQueue.push([miembro("mem_a", "usr_a", "direccion")]);
    const { removeMember } = await import("@/server/team");
    expect(await removeMember("org_1", ACTOR, "mem_a")).toMatchObject({ ok: false, status: 422, code: "self_change" });
    expect(deletes).toHaveLength(0);
  });

  it("no a alguien que puede más que quien quita", async () => {
    selectQueue.push([miembro("mem_b", "usr_b", "direccion")], ROLES);
    const { removeMember } = await import("@/server/team");
    expect(
      await removeMember("org_1", { userId: "usr_a", capabilities: SIN_PLATA as readonly Capability[] }, "mem_b")
    ).toMatchObject({ ok: false, status: 403, code: "escalation" });
    expect(deletes).toHaveLength(0);
  });

  it("siempre queda alguien a cargo", async () => {
    selectQueue.push([miembro("mem_b", "usr_b", "direccion")], ROLES, [
      miembro("mem_a", "usr_a", "ebim_manager"),
      miembro("mem_b", "usr_b", "direccion"),
    ]);
    const { removeMember } = await import("@/server/team");
    expect(await removeMember("org_1", ACTOR, "mem_b")).toMatchObject({ ok: false, status: 409, code: "last_admin" });
    expect(deletes).toHaveLength(0);
  });

  it("inexistente → 404", async () => {
    selectQueue.push([]);
    const { removeMember } = await import("@/server/team");
    expect(await removeMember("org_1", ACTOR, "mem_x")).toMatchObject({ ok: false, status: 404 });
  });
});

describe("Ver como: Equipo / Profesor", () => {
  it("la cookie se lee con default Equipo", async () => {
    const { parseViewCookie } = await import("@/lib/view-preference");
    expect(parseViewCookie("profesor")).toBe("profesor");
    expect(parseViewCookie("equipo")).toBe("equipo");
    expect(parseViewCookie(undefined)).toBe("equipo");
    expect(parseViewCookie("alumno")).toBe("equipo");
  });

  it("`/` lleva al portal SOLO si eligió Profesor y de verdad es profesor", async () => {
    const { landingRedirect } = await import("@/lib/view-preference");
    expect(landingRedirect("profesor", { isTeacher: true })).toBe("/portal");
    expect(landingRedirect("equipo", { isTeacher: true })).toBeNull();
    // una cookie vieja no manda al portal a quien ya no es profesor
    expect(landingRedirect("profesor", { isTeacher: false })).toBeNull();
  });
});
