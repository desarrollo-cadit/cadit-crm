import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * El contenedor de un material llega del cliente. Las FK se verifican FUERA de
 * RLS: sin mirar la organización antes del insert, un id de curso, camada,
 * clase o módulo de OTRA organización quedaría enganchado en un recurso
 * propio. Misma disciplina que `validateCohortForeignKeys`.
 */

let selectQueue: unknown[][] = [];
let inserts = 0;
const alcances: Array<{ columna: unknown; organizacion: string }> = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "limit"]) chain[m] = () => chain;
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db/tenant", () => ({
  scoped: (columna: unknown, organizacion: string) => {
    alcances.push({ columna, organizacion });
    return { columna, organizacion };
  },
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (v: Record<string, unknown>) => ({
        returning: async () => {
          inserts++;
          return [
            {
              ...v,
              position: 0,
              createdAt: new Date("2026-01-01T00:00:00Z"),
            },
          ];
        },
      }),
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

const { createResource } = await import("@/server/resources");

const base = { title: "Guía de Revit", url: "https://drive.google.com/guia" };

beforeEach(() => {
  selectQueue = [];
  inserts = 0;
  alcances.length = 0;
});

describe("createResource — el contenedor tiene que ser de la organización", () => {
  it.each([
    ["courseId", "course", "Curso inexistente"],
    ["cohortId", "cohort", "Camada inexistente"],
    ["classSessionId", "classSession", "Clase inexistente"],
  ] as const)("rechaza un %s de otra organización", async (campo, tabla, mensaje) => {
    selectQueue.push([]); // en la organización propia no existe
    const r = await createResource("org_1", { ...base, [campo]: "ajeno_1" });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.code).toBe("invalid_reference");
    expect(r.message).toBe(mensaje);
    expect(inserts).toBe(0);
    expect(alcances).toContainEqual({
      columna: `${tabla}.organizationId`,
      organizacion: "org_1",
    });
  });

  it("rechaza un módulo del temario de otra organización", async () => {
    selectQueue.push([{ id: "crs_1" }]); // el curso sí es propio
    selectQueue.push([]); // el módulo no
    const r = await createResource("org_1", {
      ...base,
      courseId: "crs_1",
      courseModuleId: "mod_ajeno",
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.message).toBe("Módulo del temario inexistente");
    expect(inserts).toBe(0);
  });

  it("acepta un contenedor de la organización propia", async () => {
    selectQueue.push([{ id: "coh_1" }]);
    const r = await createResource("org_1", { ...base, cohortId: "coh_1" });

    expect(r.ok).toBe(true);
    expect(inserts).toBe(1);
    expect(alcances).toContainEqual({ columna: "cohort.organizationId", organizacion: "org_1" });
  });
});
