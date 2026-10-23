import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 046 (T016; US2, FR-005, FR-006) — Guardar rutas: reemplazo total en orden.
 */

const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown }[] = [];
const deletes: { table: unknown }[] = [];

function chain() {
  const c: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) =>
    Promise.resolve(selectQueue.shift() ?? []).then(resolve, reject);
  return c;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => chain(),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return Promise.resolve([]);
      },
    }),
    delete: (table: unknown) => {
      deletes.push({ table });
      return { where: () => Promise.resolve([]) };
    },
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tabla) =>
        new Proxy({ __table: String(tabla) }, { get: (t, col) => (col === "__table" ? t.__table : `${String(tabla)}.${String(col)}`) }),
    }
  ),
}));

const { guardarSiguientes, listarRutas } = await import("@/server/course-routes");

const CURSOS = [
  { id: "arq", kind: "curso" },
  { id: "mep", kind: "curso" },
  { id: "est", kind: "curso" },
];

beforeEach(() => {
  selectQueue.length = 0;
  inserts.length = 0;
  deletes.length = 0;
});

describe("guardarSiguientes", () => {
  it("borra la lista anterior e inserta la nueva con position = índice", async () => {
    selectQueue.push(CURSOS);
    const r = await guardarSiguientes("org_1", "usr_1", "arq", ["est", "mep"]);
    expect(r).toEqual({ ok: true, route: { fromCourseId: "arq", toCourseIds: ["est", "mep"] } });
    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(1);
    const filas = inserts[0]!.values as { fromCourseId: string; toCourseId: string; position: number; organizationId: string; createdBy: string }[];
    expect(filas.map((f) => [f.toCourseId, f.position])).toEqual([
      ["est", 0],
      ["mep", 1],
    ]);
    expect(filas.every((f) => f.organizationId === "org_1" && f.fromCourseId === "arq" && f.createdBy === "usr_1")).toBe(true);
  });

  it("lista vacía: borra y no inserta", async () => {
    selectQueue.push(CURSOS);
    const r = await guardarSiguientes("org_1", "usr_1", "arq", []);
    expect(r).toEqual({ ok: true, route: { fromCourseId: "arq", toCourseIds: [] } });
    expect(deletes).toHaveLength(1);
    expect(inserts).toHaveLength(0);
  });

  it("curso ajeno → not_found, sin escribir", async () => {
    selectQueue.push(CURSOS);
    const r = await guardarSiguientes("org_1", "usr_1", "ajeno", ["mep"]);
    expect(r).toMatchObject({ ok: false, code: "not_found" });
    expect(deletes).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("autorreferencia → invalid_body, sin escribir", async () => {
    selectQueue.push(CURSOS);
    const r = await guardarSiguientes("org_1", "usr_1", "arq", ["arq"]);
    expect(r).toMatchObject({ ok: false, code: "invalid_body" });
    expect(deletes).toHaveLength(0);
  });
});

describe("listarRutas", () => {
  it("agrupa por origen respetando el orden", async () => {
    selectQueue.push([
      { fromCourseId: "arq", toCourseId: "mep", position: 0 },
      { fromCourseId: "arq", toCourseId: "est", position: 1 },
      { fromCourseId: "mep", toCourseId: "arq", position: 0 },
    ]);
    expect(await listarRutas("org_1")).toEqual([
      { fromCourseId: "arq", toCourseIds: ["mep", "est"] },
      { fromCourseId: "mep", toCourseIds: ["arq"] },
    ]);
  });
});
