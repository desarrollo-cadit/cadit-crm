import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 0086 — El profesor confirma el resultado final de SU grupo. Un grupo que no
 * alcanza (ni titular ni suplente) responde igual que uno inexistente: 404,
 * nunca 403, y no escribe nada.
 */

const selectQueue: unknown[][] = [];
const escrituras: unknown[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    selectDistinct: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => {
      escrituras.push("insert");
      return { values: () => ({ onConflictDoUpdate: async () => undefined }) };
    },
  }),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) }
  ),
}));

beforeEach(() => {
  selectQueue.length = 0;
  escrituras.length = 0;
  vi.resetModules();
});

describe("teacherFinalResults / teacherConfirmFinalResults — el alcance del profesor", () => {
  it("un grupo ajeno no se lee: null (la ruta responde 404)", async () => {
    selectQueue.push([]); // teacherReachesCohort → no alcanza
    const { teacherFinalResults } = await import("@/server/teacher-portal");
    expect(await teacherFinalResults("org_1", "tea_1", "coh_ajena")).toBeNull();
  });

  it("un grupo ajeno no se confirma: 404 not_found y ninguna escritura", async () => {
    selectQueue.push([]); // teacherReachesCohort → no alcanza
    const { teacherConfirmFinalResults } = await import("@/server/teacher-portal");
    const r = await teacherConfirmFinalResults("org_1", "tea_1", "usr_1", "coh_ajena", [
      { enrollmentId: "enr_1", result: "aprobado" },
    ]);
    expect(r).toMatchObject({ ok: false, status: 404, code: "not_found" });
    expect(escrituras).toHaveLength(0);
  });

  it("el módulo del portal sigue sin un solo 403", () => {
    const src = readFileSync(path.join(process.cwd(), "src/server/teacher-portal.ts"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(src).not.toMatch(/\b403\b/);
  });
});
