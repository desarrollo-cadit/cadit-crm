import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Iteración 3 (formularios de captación) — `submitIntakeForm` (endpoint
 * público sin auth `/api/public/forms/[formId]/submit`):
 * - 404 si el formulario no existe en la única organización de la instancia
 *   (mismo criterio mono-tenant que `resolveSoleOrganizationId`, ya probado
 *   en public-catalog.test.ts — acá solo se verifica que se respeta).
 * - Contacto nuevo: setea `source: "formulario:<nombre del form>"`.
 * - Contacto ya existente (mismo teléfono): lo reutiliza sin pisar su
 *   `source`, y de todos modos asegura el lead general vía `onLeadActivity`
 *   (reusada, no reimplementada).
 * Mismo mock de `@/lib/db` que usa el resto del repo (courses.test.ts,
 * lead-activity.test.ts) para no depender de una base real.
 */

const selectQueue: unknown[][] = [];
const insertReturnQueue: unknown[][] = [];
const inserts: { table: unknown; values: unknown; conflict?: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];

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
    select: (...args: unknown[]) => {
      const chain = thenableChain(selectQueue.shift() ?? []);
      void args;
      return chain;
    },
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        const record = { table, values, conflict: undefined as unknown };
        inserts.push(record);
        const resolveReturn = () =>
          Promise.resolve(insertReturnQueue.shift() ?? [values]);
        return {
          onConflictDoNothing: (conflict: unknown) => {
            record.conflict = conflict;
            return {
              returning: () => resolveReturn(),
              then: (resolve: (v: unknown) => void) =>
                resolveReturn().then(resolve),
            };
          },
          returning: () => resolveReturn(),
          then: (resolve: (v: unknown) => void) => resolveReturn().then(resolve),
        };
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

describe("submitIntakeForm (iteración 3, formularios de captación)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertReturnQueue.length = 0;
    inserts.length = 0;
    updates.length = 0;
    vi.resetModules();
  });

  it("404 si el formId no existe en la organización de la instancia", async () => {
    const { submitIntakeForm } = await import("@/server/intake-forms");
    selectQueue.push(
      [{ id: "org_1" }], // resolveSoleOrganizationId
      [] // form lookup vacío
    );

    const result = await submitIntakeForm("frm_inexistente", {
      name: "Xavier",
      phone: "5215512345678",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    }
  });

  it("contacto nuevo: crea el contacto con source 'formulario:<nombre>' y asegura el lead general", async () => {
    selectQueue.push(
      [{ id: "org_1" }], // resolveSoleOrganizationId
      [{ id: "frm_1", organizationId: "org_1", name: "Landing Revit", courseId: null }], // form
      [], // onLeadActivity: sin lead general existente
      [{ id: "stg_lead" }], // primera etapa abierta
      [{ max: -1 }] // sin otras tarjetas en esa etapa
    );
    insertReturnQueue.push([{ id: "ct_new", source: "formulario:Landing Revit" }]);

    const { submitIntakeForm } = await import("@/server/intake-forms");
    const result = await submitIntakeForm("frm_1", {
      name: "Xavier Pérez",
      phone: "5215512345678",
      email: "xavier@example.com",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contactId).toBe("ct_new");

    const contactInsert = inserts.find((i) =>
      String((i.values as { firstName?: string }).firstName) === "Xavier Pérez"
    );
    expect(contactInsert).toBeDefined();
    const values = contactInsert!.values as {
      source: string;
      organizationId: string;
      waIdentity: string;
    };
    expect(values.source).toBe("formulario:Landing Revit");
    expect(values.organizationId).toBe("org_1");
    // normalizeMx colapsa el prefijo 521→52 (003).
    expect(values.waIdentity).toBe("525512345678");

    // El lead general se creó (onLeadActivity reusada, no reimplementada).
    const leadInsert = inserts.find(
      (i) => (i.values as { cohortId?: unknown }).cohortId === null
    );
    expect(leadInsert).toBeDefined();
  });

  it("contacto ya existente (mismo teléfono): lo reutiliza sin pisar su source y de todos modos actualiza el lead", async () => {
    selectQueue.push(
      [{ id: "org_1" }], // resolveSoleOrganizationId
      [{ id: "frm_1", organizationId: "org_1", name: "Landing Revit", courseId: null }], // form
      [{ id: "ct_existing" }], // race lookup tras conflicto de insert
      [{ id: "enr_existing" }] // onLeadActivity: ya tiene lead general → solo actualiza
    );
    insertReturnQueue.push([]); // onConflictDoNothing: ninguna fila insertada (ya existía)

    const { submitIntakeForm } = await import("@/server/intake-forms");
    const result = await submitIntakeForm("frm_1", {
      name: "Xavier Pérez",
      phone: "5215512345678",
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.contactId).toBe("ct_existing");
    // Sin inserción nueva de enrollment: solo un update (last_activity_at).
    expect(updates).toHaveLength(1);
  });
});
