import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 014 (T006, DV-008) — No se da de baja a un profesor con cohortes.
 *
 * `cohort.teacher_id` es `SET NULL`, así que borrarlo no destruye datos — pero
 * deja las cohortes sin docente. Con Ovidio Santos serían **18 de un click**, y
 * el error se descubre semanas después: alguien abre una cohorte y no entiende
 * por qué no tiene profesor.
 *
 * Un paso más para dar de baja a alguien que ya no está es barato. Reconstruir
 * quién dictaba qué, no.
 */

const selectQueue: unknown[][] = [];
const deletes: string[] = [];
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
    delete: () => ({
      where: async () => {
        deletes.push("delete");
        return [];
      },
    }),
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          updates.push(v);
          return [];
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

describe("deleteTeacher — reasignar antes de dar de baja", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    deletes.length = 0;
    updates.length = 0;
    vi.resetModules();
  });

  it("sin cohortes asignadas: se da de baja", async () => {
    selectQueue.push([{ id: "tch_1" }]); // el profesor existe
    selectQueue.push([]); // sin cohortes

    const { deleteTeacher } = await import("@/server/contacts-admin");
    const r = await deleteTeacher("org_1", "tch_1");

    expect(r.ok).toBe(true);
    expect(deletes).toHaveLength(1);
  });

  /**
   * **El caso que justifica el archivo.** Y el mensaje dice CUÁNTAS: "tiene 18
   * cohortes asignadas" es accionable; "no se puede borrar" obliga a adivinar.
   */
  it("con cohortes: 409 con el número, y NO borra nada", async () => {
    selectQueue.push([{ id: "tch_ovidio" }]);
    selectQueue.push(Array.from({ length: 18 }, (_, i) => ({ id: `coh_${i}` })));

    const { deleteTeacher } = await import("@/server/contacts-admin");
    const r = await deleteTeacher("org_1", "tch_ovidio");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(409);
    expect(r.code).toBe("has_cohorts");
    expect(r.cohorts).toBe(18);
    expect(r.message).toContain("18");
    expect(r.message).toContain("Reasignalas");
    // Lo importante: no tocó nada.
    expect(deletes).toHaveLength(0);
  });

  it("una sola cohorte también bloquea, en singular", async () => {
    selectQueue.push([{ id: "tch_1" }]);
    selectQueue.push([{ id: "coh_1" }]);

    const { deleteTeacher } = await import("@/server/contacts-admin");
    const r = await deleteTeacher("org_1", "tch_1");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.message).toContain("1 cohorte asignada");
    expect(deletes).toHaveLength(0);
  });

  it("un profesor inexistente responde 404 y no borra", async () => {
    selectQueue.push([]);

    const { deleteTeacher } = await import("@/server/contacts-admin");
    const r = await deleteTeacher("org_1", "tch_fantasma");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
    expect(deletes).toHaveLength(0);
  });
});

describe("reassignCohorts — el camino para poder dar de baja", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    updates.length = 0;
    vi.resetModules();
  });

  it("mueve las cohortes al profesor de destino", async () => {
    selectQueue.push([{ id: "tch_2" }]); // el destino existe

    const { reassignCohorts } = await import("@/server/contacts-admin");
    const r = await reassignCohorts("org_1", "tch_1", "tch_2");

    expect(r.ok).toBe(true);
    expect(updates[0]).toMatchObject({ teacherId: "tch_2" });
  });

  /**
   * Reasignar a un profesor que no existe dejaría las cohortes apuntando a la
   * nada — el mismo problema que se quiso evitar, por otra puerta.
   */
  it("un destino inexistente se rechaza ANTES de mover nada", async () => {
    selectQueue.push([]);

    const { reassignCohorts } = await import("@/server/contacts-admin");
    const r = await reassignCohorts("org_1", "tch_1", "tch_fantasma");

    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
    expect(updates).toHaveLength(0);
  });
});
