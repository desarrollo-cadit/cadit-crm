import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 0087 — "Asignar a clase…": el material que vino de una clase del grupo
 * original se mueve a una clase del MISMO grupo. Deja de colgar del grupo (un
 * solo contenedor, `resource_contenedor_unico`) y olvida su clase de origen.
 */

const updates: { set: unknown }[] = [];
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
    update: () => ({
      set: (set: unknown) => {
        updates.push({ set });
        return { where: () => Promise.resolve([]) };
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

beforeEach(() => {
  updates.length = 0;
  selectQueue.length = 0;
});

describe("asignarMaterialAClase", () => {
  it("mueve el material a la clase y olvida su origen", async () => {
    selectQueue.push([{ id: "res_1", cohortId: "coh_1" }], [{ id: "cls_3" }]);
    const { asignarMaterialAClase } = await import("@/server/resources");
    const r = await asignarMaterialAClase("org_1", "res_1", "cls_3");
    expect(r).toEqual({ ok: true, data: { id: "res_1", classSessionId: "cls_3" } });
    expect(updates[0]!.set).toMatchObject({
      cohortId: null,
      classSessionId: "cls_3",
      originClassNumber: null,
      originClassLabel: null,
    });
  });

  it("una clase de otro grupo responde 404 y no mueve nada", async () => {
    selectQueue.push([{ id: "res_1", cohortId: "coh_1" }], []);
    const { asignarMaterialAClase } = await import("@/server/resources");
    const r = await asignarMaterialAClase("org_1", "res_1", "cls_ajena");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(updates).toEqual([]);
  });

  it("un material que no es del grupo (ya está en una clase) responde 404", async () => {
    selectQueue.push([{ id: "res_1", cohortId: null }]);
    const { asignarMaterialAClase } = await import("@/server/resources");
    const r = await asignarMaterialAClase("org_1", "res_1", "cls_3");
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(updates).toEqual([]);
  });
});
