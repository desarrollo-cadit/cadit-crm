import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 (US2, contracts/enrollments.md, T020): createEnrollment — alta con
 * contacto inline, alta con contactId existente, companyId asociado sin
 * tocar datos personales, sellerId no-miembro → 422. El dedup real de
 * email/celular (409) depende del constraint de Postgres + el mapeo
 * centralizado de `withAuth` (ver tests/unit/api.test.ts) — acá se verifica
 * que un error de duplicado en el INSERT del contacto SUBE sin ser
 * capturado (para que ese mapeo pueda actuar, DV-002).
 */

const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
const selectQueue: unknown[][] = [];
let insertContactShouldThrowDuplicate = false;
let updateReturningEmpty = false;

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
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return {
          returning: () => {
            if (
              insertContactShouldThrowDuplicate &&
              typeof values === "object" &&
              values !== null &&
              "waIdentity" in values
            ) {
              const err = new Error("duplicate key value") as Error & {
                code: string;
              };
              err.code = "23505";
              throw err;
            }
            return Promise.resolve([
              { id: (values as { id: string }).id, ...defaultsFor(values) },
            ]);
          },
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve(
                updateReturningEmpty
                  ? []
                  : [{ id: "enr_1", createdAt: new Date("2026-08-01"), ...(set as object) }]
              ),
          }),
        };
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

// Completa campos de timestamp que el código real espera en la fila devuelta.
function defaultsFor(values: unknown) {
  return { createdAt: new Date("2026-08-10"), ...(values as object) };
}

vi.mock("@/lib/meta/client", () => ({
  normalizeMx: (phone: string) => phone,
}));

describe("createEnrollment (005 US2)", () => {
  beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    selectQueue.length = 0;
    insertContactShouldThrowDuplicate = false;
    updateReturningEmpty = false;
  });

  it("alta con contacto inline: crea el contacto y la inscripción", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [{ id: "stg_lead" }] // primera etapa abierta
    );

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contact: { firstName: "Diego", phone: "59899123456", email: "diego@example.com" },
      amount: 76000,
      installments: 12,
    });

    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(2); // contact + enrollment
    const contactValues = inserts[0]!.values as { firstName: string; email: string };
    expect(contactValues.firstName).toBe("Diego");
    expect(contactValues.email).toBe("diego@example.com");
    const enrollmentValues = inserts[1]!.values as {
      cohortId: string;
      amount: number;
      installments: number;
    };
    expect(enrollmentValues.cohortId).toBe("coh_1");
    expect(enrollmentValues.amount).toBe(76000);
    expect(enrollmentValues.installments).toBe(12);
  });

  it("alta con contactId existente: NO crea un contacto nuevo", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [{ id: "ct_1", nationalId: "1.234.567-8" }], // contacto existente
      [{ id: "stg_lead" }] // primera etapa abierta
    );

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
    });

    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1); // solo enrollment
    const enrollmentValues = inserts[0]!.values as {
      contactId: string;
      nationalId: string | null;
    };
    expect(enrollmentValues.contactId).toBe("ct_1");
    expect(enrollmentValues.nationalId).toBe("1.234.567-8"); // snapshot del contacto
  });

  it("companyId queda asociado a la inscripción sin tocar los datos del contacto", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [{ id: "cia_1" }], // companyId: pertenece a la organización (hallazgo del reviewer)
      [{ id: "ct_1", nationalId: null }], // contactId existente
      [{ id: "stg_lead" }]
    );

    const { createEnrollment } = await import("@/server/enrollments");
    await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      companyId: "cia_1",
    });

    const enrollmentValues = inserts[0]!.values as { companyId: string };
    expect(enrollmentValues.companyId).toBe("cia_1");
    expect(inserts).toHaveLength(1); // ningún insert/update sobre contact
  });

  it("sellerId que no es miembro de la organización → 422 invalid_body", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [] // sellerId: sin membresía
    );

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "usr_ajeno",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("invalid_body");
    }
  });

  it("companyId que no pertenece a la organización → 422 invalid_body (hallazgo del reviewer)", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [] // companyId: ninguna fila en esta organización
    );

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      companyId: "cia_de_otra_org",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("invalid_body");
    }
    expect(inserts).toHaveLength(0);
  });

  it("cohortId inexistente → 422 invalid_body, sin insertar nada", async () => {
    selectQueue.push([]); // cohort no existe

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_inexistente",
      contactId: "ct_1",
    });

    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("duplicado de email/celular: el error del INSERT sube sin capturar (DV-002)", async () => {
    selectQueue.push([{ id: "coh_1" }]); // cohort existe
    insertContactShouldThrowDuplicate = true;

    const { createEnrollment } = await import("@/server/enrollments");
    await expect(
      createEnrollment("org_1", {
        cohortId: "coh_1",
        contact: { firstName: "Otro", phone: "59899999999", email: "ya@existe.com" },
      })
    ).rejects.toMatchObject({ code: "23505" });
  });
});

/**
 * 005 iteración 2 (feedback en vivo: faltaba editar los datos comerciales de
 * una inscripción YA creada — antes solo se podían fijar al inscribir).
 */
describe("updateEnrollmentCommercial (005 iteración 2)", () => {
  beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    selectQueue.length = 0;
    updateReturningEmpty = false;
  });

  it("solo actualiza los campos presentes en el input", async () => {
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const result = await updateEnrollmentCommercial("org_1", "enr_1", { amount: 90000 });

    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.amount).toBe(90000);
    expect("installments" in set).toBe(false);
    expect("nationalId" in set).toBe(false);
  });

  it("acepta null para limpiar un campo comercial (ej. desasociar empresa)", async () => {
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    await updateEnrollmentCommercial("org_1", "enr_1", { companyId: null });

    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.companyId).toBeNull();
  });

  it("sellerId que no es miembro de la organización → 422 invalid_body, sin actualizar", async () => {
    selectQueue.push([]); // sellerId: sin membresía

    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const result = await updateEnrollmentCommercial("org_1", "enr_1", {
      sellerId: "usr_ajeno",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("invalid_body");
    }
    expect(updates).toHaveLength(0);
  });

  it("companyId que no pertenece a la organización → 422 invalid_body, sin actualizar (hallazgo del reviewer)", async () => {
    selectQueue.push([]); // companyId: ninguna fila en esta organización

    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const result = await updateEnrollmentCommercial("org_1", "enr_1", {
      companyId: "cia_de_otra_org",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(422);
      expect(result.code).toBe("invalid_body");
    }
    expect(updates).toHaveLength(0);
  });

  it("inscripción inexistente → 404 not_found", async () => {
    updateReturningEmpty = true;

    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const result = await updateEnrollmentCommercial("org_1", "enr_x", { amount: 1000 });

    expect(result).toEqual({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Inscripción no encontrada",
    });
  });
});

/**
 * Iteración 6 — exportCohortRosterCsv: camada inexistente → null (404 en la
 * ruta), formato RFC 4180 (header + escapado de coma/comilla/salto de línea),
 * y que NO incluya ningún campo financiero (deliberadamente no reusa
 * buildRosterEntry).
 */
describe("exportCohortRosterCsv (005 iteración 6)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
  });

  it("camada inexistente en la organización → null", async () => {
    selectQueue.push([]); // cohort: ninguna fila scopeada

    const { exportCohortRosterCsv } = await import("@/server/enrollments");
    const result = await exportCohortRosterCsv("org_1", "coh_ajena");

    expect(result).toBeNull();
  });

  it("arma el CSV con header y escapa comas/comillas/saltos de línea (RFC 4180)", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [
        { firstName: "Diego", lastName: "Pérez", email: "diego@example.com" },
        { firstName: "María, José", lastName: 'La "Jefa"', email: null },
      ]
    );

    const { exportCohortRosterCsv } = await import("@/server/enrollments");
    const result = await exportCohortRosterCsv("org_1", "coh_1");

    expect(result).toBe(
      [
        "nombre,apellido,correo",
        "Diego,Pérez,diego@example.com",
        '"María, José","La ""Jefa""",',
      ].join("\r\n")
    );
  });

  it("camada sin inscripciones → CSV solo con el header", async () => {
    selectQueue.push([{ id: "coh_1" }], []);

    const { exportCohortRosterCsv } = await import("@/server/enrollments");
    const result = await exportCohortRosterCsv("org_1", "coh_1");

    expect(result).toBe("nombre,apellido,correo");
  });
});
