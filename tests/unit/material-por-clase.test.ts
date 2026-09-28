import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 029 — El material de TODAS las clases de una cohorte, en un solo pedido.
 *
 * La pestaña Clases montaba un panel de material por fila y cada panel pedía
 * lo suyo: una cohorte de 100 clases disparaba 100 requests. Ahora la pantalla
 * pide una vez y reparte. Lo que se prueba acá es el reparto (pura) y que el
 * servidor lo resuelve con UNA consulta, no con una por clase.
 */

let filas: unknown[] = [];
let consultas = 0;
let dondeRecibido: unknown = null;

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  chain.where = (w: unknown) => {
    dondeRecibido = w;
    return chain;
  };
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => {
      consultas++;
      return thenableChain(filas);
    },
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy({}, { get: (_t2, col) => `${String(tableName)}.${String(col)}` }),
    }
  ),
}));

const { agruparMaterialPorClase, listClassResourcesOfCohort } = await import(
  "@/server/resources"
);

function fila(id: string, classSessionId: string | null, position = 0) {
  return {
    id,
    organizationId: "org_1",
    title: `Material ${id}`,
    url: `https://ejemplo.com/${id}`,
    kind: "enlace" as const,
    position,
    courseId: null,
    cohortId: null,
    classSessionId,
    courseModuleId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  };
}

beforeEach(() => {
  filas = [];
  consultas = 0;
  dondeRecibido = null;
});

describe("agruparMaterialPorClase", () => {
  it("reparte por clase y conserva el orden en que vino", () => {
    const r = agruparMaterialPorClase([
      fila("r1", "cls_a"),
      fila("r2", "cls_b"),
      fila("r3", "cls_a"),
    ]);
    expect(Object.keys(r).sort()).toEqual(["cls_a", "cls_b"]);
    expect(r.cls_a?.map((x) => x.id)).toEqual(["r1", "r3"]);
    expect(r.cls_b?.map((x) => x.id)).toEqual(["r2"]);
  });

  it("una clase sin material no aparece: la pantalla la lee como lista vacía", () => {
    expect(agruparMaterialPorClase([])).toEqual({});
  });

  it("descarta lo que no cuelga de una clase (curso o cohorte)", () => {
    const r = agruparMaterialPorClase([fila("r1", null)]);
    expect(r).toEqual({});
  });

  it("no filtra columnas internas: viaja el mismo DTO que el pedido por clase", () => {
    const r = agruparMaterialPorClase([fila("r1", "cls_a")]);
    expect(r.cls_a?.[0]).not.toHaveProperty("organizationId");
    expect(r.cls_a?.[0]).not.toHaveProperty("createdAt");
  });
});

describe("listClassResourcesOfCohort", () => {
  it("resuelve todas las clases de la cohorte con UNA consulta", async () => {
    filas = [fila("r1", "cls_a"), fila("r2", "cls_b"), fila("r3", "cls_a")];
    const r = await listClassResourcesOfCohort("org_1", "coh_1");
    expect(consultas).toBe(1);
    expect(r.cls_a?.map((x) => x.id)).toEqual(["r1", "r3"]);
    expect(dondeRecibido).not.toBeNull();
  });
});
