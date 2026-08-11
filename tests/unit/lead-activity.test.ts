import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 004 FR-010/SC-005: `onLeadActivity` debe seguir creando/actualizando el
 * LEAD GENERAL (enrollment sin cohort_id) exactamente como antes creaba
 * `lead` — mismo mock de `@/lib/db` que usa `lab-sandbox.test.ts` para no
 * depender de una base real (convención del repo).
 */

const selectQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown; conflict?: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "where", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        const record = { table, values, conflict: undefined as unknown };
        inserts.push(record);
        const chain = {
          onConflictDoNothing: (conflict: unknown) => {
            record.conflict = conflict;
            return Promise.resolve([values]);
          },
          then: (resolve: (v: unknown) => void) =>
            Promise.resolve([values]).then(resolve),
        };
        return chain;
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return { where: () => Promise.resolve([{}]) };
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          { get: (_t2, col) => `${String(tableName)}.${String(col)}` }
        ),
    }
  ),
}));

describe("onLeadActivity — lead general de ventas (004 FR-010)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    inserts.length = 0;
    updates.length = 0;
    vi.resetModules();
  });

  it("contacto nuevo sin lead general → crea un enrollment con cohortId: null en la primera etapa abierta", async () => {
    selectQueue.push(
      [], // sin lead general existente
      [{ id: "stg_lead" }], // primera etapa kind: open
      [{ max: -1 }] // sin otras tarjetas en esa etapa
    );

    const { onLeadActivity } = await import("@/server/inbox/lead-activity");
    await onLeadActivity("org_1", "ct_1", new Date());

    expect(inserts).toHaveLength(1);
    const values = inserts[0]!.values as {
      contactId: string;
      cohortId: string | null;
      stageId: string;
      organizationId: string;
    };
    expect(values.contactId).toBe("ct_1");
    expect(values.cohortId).toBeNull();
    expect(values.stageId).toBe("stg_lead");
    expect(values.organizationId).toBe("org_1");
    expect(inserts[0]!.conflict).toBeDefined();
    expect(updates).toHaveLength(0);
  });

  it("contacto con lead general existente → actualiza last_activity_at sin insertar", async () => {
    selectQueue.push([{ id: "enr_existing" }]);

    const { onLeadActivity } = await import("@/server/inbox/lead-activity");
    await onLeadActivity("org_1", "ct_1", new Date());

    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
  });
});
