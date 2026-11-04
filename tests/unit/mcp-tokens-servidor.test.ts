import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { capabilitiesFor } from "@/lib/capabilities";
import { hashDeToken, nuevoToken } from "@/lib/mcp-token";

/**
 * 0092 — La resolución del token del MCP remoto: emitir, resolver y revocar.
 *
 * Sin base: se simulan las consultas. Lo que se fija acá es la LÓGICA —nunca se
 * guarda el valor en claro, un token que no existe / ya no sirve / cuya dueña
 * salió del equipo no resuelve, y las capacidades salen del rol y no del
 * token—. Que `mcp_token` conserva su RLS lo cubre `rls-cobertura.test.ts`.
 */

const selectQueue: unknown[][] = [];
const inserts: Record<string, unknown>[] = [];
const updates: Record<string, unknown>[] = [];
let filasActualizadas: unknown[] = [];

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
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        inserts.push(v);
      },
    }),
    update: () => ({
      set: (v: Record<string, unknown>) => {
        updates.push(v);
        return {
          where: () => {
            const p = Promise.resolve(filasActualizadas) as Promise<unknown[]> & {
              returning: () => Promise<unknown[]>;
            };
            p.returning = () => Promise.resolve(filasActualizadas);
            return p;
          },
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

const resolveInstanceOrg = vi.fn();
vi.mock("@/server/bot/auth", () => ({
  resolveInstanceOrg: () => resolveInstanceOrg(),
}));

const resolveMembership = vi.fn();
vi.mock("@/server/auth/on-signup", () => ({
  resolveMembership: (...args: unknown[]) => resolveMembership(...args),
}));

import { emitirToken, listarTokens, resolverToken, revocarToken } from "@/server/mcp/tokens";

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  updates.length = 0;
  filasActualizadas = [];
  resolveInstanceOrg.mockReset().mockResolvedValue("org_1");
  resolveMembership.mockReset();
});

describe("emitirToken", () => {
  it("guarda el hash y NUNCA el valor en claro", async () => {
    const emitido = await emitirToken("org_1", "user_1", "Claude Code de Cristina");

    expect(inserts).toHaveLength(1);
    const fila = inserts[0]!;
    expect(fila.tokenHash).toBe(hashDeToken(emitido.token));
    expect(fila).toMatchObject({
      organizationId: "org_1",
      userId: "user_1",
      name: "Claude Code de Cristina",
      last4: emitido.token.slice(-4),
    });
    expect(JSON.stringify(fila)).not.toContain(emitido.token);
    expect(String(fila.id)).toMatch(/^mcpt_/);
  });

  it("devuelve el valor para mostrarlo una vez, y solo a quien lo emitió", async () => {
    const emitido = await emitirToken("org_1", "user_1", "x");
    expect(emitido.token.startsWith("cadit_mcp_")).toBe(true);
    expect(emitido.last4).toBe(emitido.token.slice(-4));
  });
});

describe("resolverToken", () => {
  const ahora = new Date("2026-11-03T12:00:00Z");
  const valido = nuevoToken().token;
  const fila = (lastUsedAt: Date | null) => ({ id: "mcpt_1", userId: "user_1", lastUsedAt });

  it("un valor que no tiene nuestra forma no toca ni la base", async () => {
    expect(await resolverToken("cualquier-cosa", ahora)).toBeNull();
    expect(resolveInstanceOrg).not.toHaveBeenCalled();
    expect(resolveMembership).not.toHaveBeenCalled();
  });

  it("sin organización en la instancia → null", async () => {
    resolveInstanceOrg.mockResolvedValue(null);
    expect(await resolverToken(valido, ahora)).toBeNull();
  });

  it("token desconocido o revocado (la consulta no lo encuentra) → null", async () => {
    selectQueue.push([]);
    expect(await resolverToken(valido, ahora)).toBeNull();
    expect(resolveMembership).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
  });

  it("la consulta excluye los revocados (el filtro está en el SQL, no en memoria)", () => {
    const fuente = readFileSync("src/server/mcp/tokens.ts", "utf8");
    const cuerpo = fuente.slice(
      fuente.indexOf("export async function resolverToken"),
      fuente.indexOf("export type TokenEmitido")
    );
    expect(cuerpo).toContain("isNull(schema.mcpToken.revokedAt)");
    expect(cuerpo).toContain("eq(schema.mcpToken.tokenHash, hashDeToken(token))");
  });

  it("su dueña ya no está en el equipo → null", async () => {
    selectQueue.push([fila(null)]);
    resolveMembership.mockResolvedValue(null);
    expect(await resolverToken(valido, ahora)).toBeNull();
  });

  it("su dueña quedó en otra organización → null", async () => {
    selectQueue.push([fila(null)]);
    resolveMembership.mockResolvedValue({
      organizationId: "org_ajena",
      role: "direccion",
      capabilities: null,
    });
    expect(await resolverToken(valido, ahora)).toBeNull();
  });

  it("las capacidades salen del ROL (base) y se descarta lo que ya no existe", async () => {
    selectQueue.push([fila(null)]);
    resolveMembership.mockResolvedValue({
      organizationId: "org_1",
      role: "coordinacion",
      capabilities: ["academico.ver", "capacidad.inventada"],
    });

    const ctx = await resolverToken(valido, ahora);

    expect(ctx).toEqual({
      tokenId: "mcpt_1",
      organizationId: "org_1",
      userId: "user_1",
      capacidades: ["academico.ver"],
    });
  });

  it("sin rol sembrado en la base manda el mapeo de código, como en la sesión", async () => {
    selectQueue.push([fila(null)]);
    resolveMembership.mockResolvedValue({
      organizationId: "org_1",
      role: "ventas",
      capabilities: null,
    });

    const ctx = await resolverToken(valido, ahora);

    expect(ctx?.capacidades).toEqual(capabilitiesFor("ventas"));
  });

  it("anota el último uso la primera vez y pasado el margen, no en cada pedido", async () => {
    const membresia = { organizationId: "org_1", role: "direccion", capabilities: null };

    selectQueue.push([fila(null)]);
    resolveMembership.mockResolvedValue(membresia);
    await resolverToken(valido, ahora);
    expect(updates).toEqual([{ lastUsedAt: ahora }]);

    updates.length = 0;
    selectQueue.push([fila(new Date(ahora.getTime() - 10_000))]);
    await resolverToken(valido, ahora);
    expect(updates).toHaveLength(0);

    selectQueue.push([fila(new Date(ahora.getTime() - 5 * 60_000))]);
    await resolverToken(valido, ahora);
    expect(updates).toEqual([{ lastUsedAt: ahora }]);
  });
});

describe("revocarToken", () => {
  it("marca el token y avisa que lo hizo", async () => {
    filasActualizadas = [{ id: "mcpt_1" }];
    expect(await revocarToken("org_1", "mcpt_1")).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.revokedAt).toBeInstanceOf(Date);
  });

  it("uno que no existe en la organización, o que ya estaba revocado → false", async () => {
    filasActualizadas = [];
    expect(await revocarToken("org_1", "mcpt_x")).toBe(false);
  });
});

describe("listarTokens", () => {
  it("deja los vigentes primero", async () => {
    const dia = (d: number) => new Date(`2026-11-0${d}T00:00:00Z`);
    const base = { name: "n", last4: "abcd", userId: "u", userName: "U", userEmail: "u@x.uy" };
    selectQueue.push([
      { ...base, id: "revocado-nuevo", createdAt: dia(3), lastUsedAt: null, revokedAt: dia(3) },
      { ...base, id: "vigente-viejo", createdAt: dia(1), lastUsedAt: null, revokedAt: null },
    ]);

    const lista = await listarTokens("org_1");

    expect(lista.map((t) => t.id)).toEqual(["vigente-viejo", "revocado-nuevo"]);
  });
});
