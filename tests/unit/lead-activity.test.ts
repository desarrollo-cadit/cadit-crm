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
  // 012 (T024) — `withAuth` abre la transacción del pedido con
  // `getRootDb().transaction()` para declarar `app.current_org`. Sin este
  // doble, cualquier prueba que atraviese el borde de autenticación falla
  // antes de llegar al handler.
  getRootDb: () => ({
    transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ execute: async () => [] }),
  }),
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
    // Sin curso de interés no se toca la columna (ingesta de WhatsApp).
    expect(updates[0]!.set).not.toHaveProperty("interestCourseId");
  });

  /**
   * 005 iteración 7 — curso de interés: viene del formulario de captación
   * atado a un curso y es atribución de PRIMER contacto.
   */
  it("lead nuevo con curso de interés → lo guarda en interest_course_id", async () => {
    selectQueue.push([], [{ id: "stg_lead" }], [{ max: -1 }]);

    const { onLeadActivity } = await import("@/server/inbox/lead-activity");
    await onLeadActivity("org_1", "ct_1", new Date(), "crs_revit");

    const values = inserts[0]!.values as { interestCourseId: string | null };
    expect(values.interestCourseId).toBe("crs_revit");
  });

  it("lead existente con curso de interés → lo rellena con coalesce, sin pisar el primero", async () => {
    selectQueue.push([{ id: "enr_existing" }]);

    const { onLeadActivity } = await import("@/server/inbox/lead-activity");
    await onLeadActivity("org_1", "ct_1", new Date(), "crs_autocad");

    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    // El valor es un fragmento SQL `coalesce(...)`: la garantía de "no pisar"
    // la da Postgres, acá solo se verifica que la columna se actualiza así y
    // no con una asignación directa.
    const set = updates[0]!.set as { interestCourseId?: unknown };
    expect(set.interestCourseId).toBeDefined();
    expect(JSON.stringify(set.interestCourseId)).toContain("coalesce");
  });
});
