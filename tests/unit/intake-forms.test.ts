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

  /**
   * 005 iteración 7 — apellido separado y curso de interés como FK. El
   * `source` de texto sigue existiendo, pero de qué curso vino el lead ahora
   * se sabe por `enrollment.interest_course_id`.
   */
  it("formulario atado a un curso: guarda el apellido y propaga el curso al lead", async () => {
    selectQueue.push(
      [{ id: "org_1" }], // resolveSoleOrganizationId
      [
        {
          id: "frm_1",
          organizationId: "org_1",
          name: "Landing Revit",
          courseId: "crs_revit",
        },
      ], // form atado al curso
      [], // onLeadActivity: sin lead general existente
      [{ id: "stg_lead" }], // primera etapa abierta
      [{ max: -1 }]
    );
    insertReturnQueue.push([{ id: "ct_new" }]);

    const { submitIntakeForm } = await import("@/server/intake-forms");
    const result = await submitIntakeForm("frm_1", {
      name: "Xavier",
      lastName: "Pérez",
      phone: "5215512345678",
    });

    expect(result.ok).toBe(true);

    const contactValues = inserts[0]!.values as {
      firstName: string;
      lastName: string | null;
    };
    expect(contactValues.firstName).toBe("Xavier");
    expect(contactValues.lastName).toBe("Pérez");

    const leadInsert = inserts.find(
      (i) => (i.values as { cohortId?: unknown }).cohortId === null
    );
    expect(
      (leadInsert!.values as { interestCourseId: string | null }).interestCourseId
    ).toBe("crs_revit");
  });

  it("sin apellido (snippet viejo ya embebido en un sitio): lastName queda NULL y el alta funciona igual", async () => {
    selectQueue.push(
      [{ id: "org_1" }],
      [{ id: "frm_1", organizationId: "org_1", name: "Landing Revit", courseId: null }],
      [],
      [{ id: "stg_lead" }],
      [{ max: -1 }]
    );
    insertReturnQueue.push([{ id: "ct_new" }]);

    const { submitIntakeForm } = await import("@/server/intake-forms");
    const result = await submitIntakeForm("frm_1", {
      name: "Xavier Pérez",
      phone: "5215512345678",
    });

    expect(result.ok).toBe(true);
    const contactValues = inserts[0]!.values as {
      firstName: string;
      lastName: string | null;
    };
    expect(contactValues.firstName).toBe("Xavier Pérez");
    expect(contactValues.lastName).toBeNull();
  });
});

/**
 * 005 iteración 8 — captación directa por curso del catálogo, sin
 * `intake_form` de por medio: la página del curso postea a
 * `/api/public/courses/<slug>/submit` y el lead entra atribuido a ese curso.
 */
describe("submitCourseInterest (iteración 8, captación por curso)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
    insertReturnQueue.length = 0;
    inserts.length = 0;
    updates.length = 0;
    vi.resetModules();
  });

  it("404 si el slug no existe en la organización de la instancia", async () => {
    selectQueue.push(
      [{ id: "org_1" }], // resolveSoleOrganizationId
      [] // curso no encontrado
    );

    const { submitCourseInterest } = await import("@/server/intake-forms");
    const result = await submitCourseInterest("curso-inexistente", {
      name: "Xavier",
      phone: "5215512345678",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.code).toBe("not_found");
    }
    // Nada se dio de alta cuando el curso no existe.
    expect(inserts).toHaveLength(0);
  });

  it("slug válido: crea el contacto y atribuye el lead a ese curso, sin intake_form", async () => {
    selectQueue.push(
      [{ id: "org_1" }], // resolveSoleOrganizationId
      [{ id: "crs_revit", name: "Revit" }], // curso por slug
      [], // onLeadActivity: sin lead general existente
      [{ id: "stg_lead" }], // primera etapa abierta
      [{ max: -1 }]
    );
    insertReturnQueue.push([{ id: "ct_new" }]);

    const { submitCourseInterest } = await import("@/server/intake-forms");
    const result = await submitCourseInterest("revit", {
      name: "Xavier",
      lastName: "Pérez",
      phone: "5215512345678",
      notes: "quiero info",
    });

    expect(result.ok).toBe(true);

    const contactValues = inserts[0]!.values as {
      firstName: string;
      lastName: string | null;
      source: string;
      waIdentity: string;
    };
    expect(contactValues.firstName).toBe("Xavier");
    expect(contactValues.lastName).toBe("Pérez");
    // Mismo prefijo que el resto de la captación pública: el badge del
    // sidebar y el tag de contactos siguen funcionando sin cambios.
    expect(contactValues.source).toBe("formulario:Revit");
    expect(contactValues.waIdentity).toBe("525512345678");

    const leadInsert = inserts.find(
      (i) => (i.values as { cohortId?: unknown }).cohortId === null
    );
    expect(
      (leadInsert!.values as { interestCourseId: string | null }).interestCourseId
    ).toBe("crs_revit");
  });
});
