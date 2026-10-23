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

// 041 — El aviso a Administración tiene sus propias pruebas
// (avisos-cobranza*.test.ts); acá solo se mira que el alta lo pida.
const avisarAAdministracion = vi.fn(async () => {});
vi.mock("@/server/billing-notices-queue", () => ({ avisarAAdministracion }));

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

// 2026-10-21 — El chequeo de duplicados tiene su propia consulta; acá se
// decide qué devuelve sin gastar filas de `selectQueue`.
const buscarContactoDuplicado = vi.fn(async (): Promise<unknown> => null);
vi.mock("@/server/contact-duplicates", () => ({ buscarContactoDuplicado }));

describe("createEnrollment — contacto sin teléfono y correo de licencia (2026-10-21)", () => {
  beforeEach(() => {
    inserts.length = 0;
    updates.length = 0;
    selectQueue.length = 0;
    insertContactShouldThrowDuplicate = false;
    buscarContactoDuplicado.mockReset();
    buscarContactoDuplicado.mockResolvedValue(null);
  });

  it("contacto nuevo con solo correo: identidad provisional, correo en minúsculas", async () => {
    selectQueue.push([{ id: "coh_1" }], [{ id: "sel_1", archivedAt: null }], [{ id: "stg_lead" }]);

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      sellerId: "sel_1",
      contact: { firstName: "Ana", email: "Ana@Mail.COM" },
    });

    expect(result.ok).toBe(true);
    const contacto = inserts[0]!.values as {
      id: string;
      phone: string | null;
      email: string;
      waIdentity: string;
    };
    expect(contacto.phone).toBeNull();
    expect(contacto.email).toBe("ana@mail.com");
    expect(contacto.waIdentity).toBe(`sinwa:${contacto.id}`);
  });

  it("correo ya usado: 409 que nombra al contacto y no crea nada", async () => {
    selectQueue.push([{ id: "coh_1" }], [{ id: "sel_1", archivedAt: null }]);
    buscarContactoDuplicado.mockResolvedValue({
      campo: "correo",
      contacto: { id: "ct_9", name: "Ana Pérez" },
    });

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      sellerId: "sel_1",
      contact: { firstName: "Ana", email: "ana@mail.com" },
    });

    expect(result).toMatchObject({
      ok: false,
      status: 409,
      message: "Ya existe un contacto con ese correo: Ana Pérez",
      duplicado: { contacto: { id: "ct_9" } },
    });
    expect(inserts).toHaveLength(0);
  });

  it("guarda el correo de la licencia en minúsculas", async () => {
    selectQueue.push(
      [{ id: "coh_1" }],
      [{ id: "sel_1", archivedAt: null }],
      [{ id: "ct_1", nationalId: null }],
      [{ id: "stg_lead" }]
    );

    const { createEnrollment } = await import("@/server/enrollments");
    await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "sel_1",
      licenseEmail: " Licencias@Empresa.UY ",
    });

    const inscripcion = inserts[0]!.values as { licenseEmail: string | null };
    expect(inscripcion.licenseEmail).toBe("licencias@empresa.uy");
  });
});

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
      [{ id: "sel_1", archivedAt: null }], // 2026-10-06 — vendedor activo
      [{ id: "stg_lead" }] // primera etapa abierta
    );

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      sellerId: "sel_1",
      contact: { firstName: "Diego", phone: "59899123456", email: "diego@example.com" },
      amount: 7600000,
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
    expect(enrollmentValues.amount).toBe(7600000);
    expect(enrollmentValues.installments).toBe(12);
  });

  it("alta con contactId existente: NO crea un contacto nuevo", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [{ id: "sel_1", archivedAt: null }], // 2026-10-06 — vendedor activo
      [{ id: "ct_1", nationalId: "1.234.567-8" }], // contacto existente
      [{ id: "stg_lead" }] // primera etapa abierta
    );

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "sel_1",
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
      [{ id: "sel_1", archivedAt: null }], // 2026-10-06 — vendedor activo
      [{ id: "cia_1" }], // companyId: pertenece a la organización (hallazgo del reviewer)
      [{ id: "ct_1", nationalId: null }], // contactId existente
      [{ id: "stg_lead" }]
    );

    const { createEnrollment } = await import("@/server/enrollments");
    await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "sel_1",
      companyId: "cia_1",
    });

    const enrollmentValues = inserts[0]!.values as { companyId: string };
    expect(enrollmentValues.companyId).toBe("cia_1");
    expect(inserts).toHaveLength(1); // ningún insert/update sobre contact
  });

  it("2026-10-06 — sellerId que no es un vendedor de la organización → 422 invalid_body", async () => {
    selectQueue.push(
      [{ id: "coh_1" }], // cohort existe
      [] // sellerId: no es un vendedor de esta organización
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
      [{ id: "sel_1", archivedAt: null }], // 2026-10-06 — vendedor activo
      [] // companyId: ninguna fila en esta organización
    );

    const { createEnrollment } = await import("@/server/enrollments");
    const result = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "sel_1",
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
    selectQueue.push([{ id: "coh_1" }], [{ id: "sel_1", archivedAt: null }]); // cohort + vendedor
    insertContactShouldThrowDuplicate = true;

    const { createEnrollment } = await import("@/server/enrollments");
    await expect(
      createEnrollment("org_1", {
        cohortId: "coh_1",
        sellerId: "sel_1",
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
    const result = await updateEnrollmentCommercial("org_1", "enr_1", { amount: 9000000 });

    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.amount).toBe(9000000);
    expect("installments" in set).toBe(false);
    expect("nationalId" in set).toBe(false);
  });

  it("acepta null para limpiar un campo comercial (ej. desasociar empresa)", async () => {
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    await updateEnrollmentCommercial("org_1", "enr_1", { companyId: null });

    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.companyId).toBeNull();
  });

  it("sellerId que no es un vendedor de la organización → 422 invalid_body, sin actualizar", async () => {
    selectQueue.push(
      [{ cohortId: "coh_1", parentEnrollmentId: null, sellerId: null }], // la inscripción
      [] // sellerId: no es un vendedor de esta organización
    );

    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const result = await updateEnrollmentCommercial("org_1", "enr_1", {
      sellerId: "sel_ajeno",
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
    const result = await updateEnrollmentCommercial("org_1", "enr_x", { amount: 100000 });

    expect(result).toEqual({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Inscripción no encontrada",
    });
  });
});

/**
 * Iteración 6 — exportCohortRosterCsv: cohorte inexistente → null (404 en la
 * ruta), formato RFC 4180 (header + escapado de coma/comilla/salto de línea),
 * y que NO incluya ningún campo financiero (deliberadamente no reusa
 * buildRosterEntry).
 */
describe("exportCohortRosterCsv (005 iteración 6)", () => {
  beforeEach(() => {
    selectQueue.length = 0;
  });

  it("cohorte inexistente en la organización → null", async () => {
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
        "nombre,apellido,correo,correo_licencia",
        "Diego,Pérez,diego@example.com,diego@example.com",
        '"María, José","La ""Jefa""",,',
      ].join("\r\n")
    );
  });

  it("neutraliza fórmulas: un nombre que arranca con = + - @ no se ejecuta en Excel", async () => {
    selectQueue.push(
      [{ id: "coh_1" }],
      [
        { firstName: "=1+1", lastName: "+cmd|calc", email: "-x@example.com" },
        { firstName: "@SUM(A1)", lastName: "Normal", email: null },
      ]
    );

    const { exportCohortRosterCsv } = await import("@/server/enrollments");
    const result = await exportCohortRosterCsv("org_1", "coh_1");
    const lines = result!.split("\r\n");

    // Apóstrofo delante de todo lo que empieza con un caracter de fórmula: el
    // nombre puede venir del formulario público sin autenticar.
    expect(lines[1]).toBe("'=1+1,'+cmd|calc,'-x@example.com,'-x@example.com");
    expect(lines[2]).toBe("'@SUM(A1),Normal,,");
  });

  it("cohorte sin inscripciones → CSV solo con el header", async () => {
    selectQueue.push([{ id: "coh_1" }], []);

    const { exportCohortRosterCsv } = await import("@/server/enrollments");
    const result = await exportCohortRosterCsv("org_1", "coh_1");

    expect(result).toBe("nombre,apellido,correo,correo_licencia");
  });

  /**
   * 2026-10-23 — "Exportar para licenciamiento": las mismas columnas, solo
   * quien necesita una licencia prestada (`necesitaLicencia`: asignada, propia
   * o de sus módulos, y sin "Tenía licencia propia") y con el correo de la
   * LICENCIA (`correoDeLicencia`) en la columna del correo.
   */
  it("para licenciamiento: solo quien necesita licencia, con el correo de la licencia", async () => {
    selectQueue.push(
      [{ id: "coh_1" }],
      [
        // Licencia asignada, correo de licencia distinto → entra con ese correo.
        { id: "enr_1", firstName: "Ana", lastName: "A", email: "ana@x.com", licenseEmail: "empresa@x.com", hadOwnLicense: false, parentEnrollmentId: null },
        // Licencia asignada pero tenía la propia → fuera.
        { id: "enr_2", firstName: "Beto", lastName: "B", email: "beto@x.com", licenseEmail: null, hadOwnLicense: true, parentEnrollmentId: null },
        // Sin licencia asignada → fuera.
        { id: "enr_3", firstName: "Ceci", lastName: "C", email: "ceci@x.com", licenseEmail: null, hadOwnLicense: false, parentEnrollmentId: null },
        // Madre de especialización: la licencia es de un módulo → entra.
        { id: "enr_4", firstName: "Dani", lastName: "D", email: "dani@x.com", licenseEmail: null, hadOwnLicense: false, parentEnrollmentId: null },
        // Hija de módulo con licencia, cuya madre la tenía propia → fuera.
        { id: "enr_5", firstName: "Eva", lastName: "E", email: "eva@x.com", licenseEmail: null, hadOwnLicense: false, parentEnrollmentId: "enr_m" },
        // Hija de módulo con licencia: hereda el correo de licencia de la madre.
        { id: "enr_6", firstName: "Fede", lastName: "F", email: "fede@x.com", licenseEmail: null, hadOwnLicense: false, parentEnrollmentId: "enr_m2" },
      ],
      // Las madres de las hijas.
      [
        { id: "enr_m", licenseEmail: null, hadOwnLicense: true },
        { id: "enr_m2", licenseEmail: "madre@x.com", hadOwnLicense: false },
      ],
      // Licencias asignadas: de la inscripción o de una hija suya.
      [
        { enrollmentId: "enr_1", parentEnrollmentId: null },
        { enrollmentId: "enr_2", parentEnrollmentId: null },
        { enrollmentId: "enr_h4", parentEnrollmentId: "enr_4" },
        { enrollmentId: "enr_5", parentEnrollmentId: "enr_m" },
        { enrollmentId: "enr_6", parentEnrollmentId: "enr_m2" },
      ]
    );

    const { exportCohortRosterCsv } = await import("@/server/enrollments");
    const result = await exportCohortRosterCsv("org_1", "coh_1", "licenciamiento");

    expect(result).toBe(
      [
        "nombre,apellido,correo,correo_licencia",
        "Ana,A,empresa@x.com,empresa@x.com",
        "Dani,D,dani@x.com,dani@x.com",
        "Fede,F,madre@x.com,madre@x.com",
      ].join("\r\n")
    );
  });

  it("la exportación común no consulta licencias ni madres", async () => {
    selectQueue.push(
      [{ id: "coh_1" }],
      [{ id: "enr_1", firstName: "Ana", lastName: "A", email: "ana@x.com", licenseEmail: null, hadOwnLicense: true, parentEnrollmentId: null }]
    );
    const { exportCohortRosterCsv } = await import("@/server/enrollments");
    const result = await exportCohortRosterCsv("org_1", "coh_1");
    expect(result).toBe(["nombre,apellido,correo,correo_licencia", "Ana,A,ana@x.com,ana@x.com"].join("\r\n"));
    expect(selectQueue).toHaveLength(0);
  });
});
