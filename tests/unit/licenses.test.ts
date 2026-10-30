import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 (T032, US4, FR-002/FR-003/FR-004): el pool de licencias se descuenta
 * al asignar y se libera al liberar/dar de baja; asignar con
 * `available === 0` rechaza (409 no_stock). 0089: el cupo es de cada EQUIPO
 * de licencias y el equipo se elige al asignar.
 */

const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
const selectQueue: unknown[][] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "orderBy", "limit", "groupBy"]) {
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
    // 035 — el advisory lock del stock (`bloquearStock`).
    execute: async () => [],
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return {
          returning: () => Promise.resolve([{ ...(values as object) }]),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([{ id: "lic_updated", ...(set as object) }]),
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

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  selectQueue.length = 0;
});


/**
 * 023 — El conteo de ocupadas dejó de ser `select count(*) where assigned`.
 *
 * Ahora se traen las licencias CON su cohorte y la ocupación se DERIVA: una
 * licencia de un curso terminado ya no descuenta del pool. Por eso las colas
 * de estas pruebas devuelven filas, no un `{ n }`.
 */
const VIVA = new Date("2027-12-31T00:00:00.000Z");
const TERMINADA = new Date("2020-01-01T00:00:00.000Z");

/** Una licencia de un curso EN CURSO: ocupa. */
function ocupada(softwareId: string) {
  return {
    softwareId,
    assigned: true,
    expiresAt: null,
    startDate: TERMINADA,
    endDate: VIVA,
  };
}

/** Una licencia de un curso YA TERMINADO: no ocupa. */
function liberada(softwareId: string) {
  return {
    softwareId,
    assigned: true,
    expiresAt: null,
    startDate: TERMINADA,
    endDate: TERMINADA,
  };
}

describe("availableLicenses (T028, DV-004)", () => {
  it("total - assignedCount", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    selectQueue.push(
      [{ name: "Revit", total: 5 }],
      [ocupada("sw_1"), ocupada("sw_1"), ocupada("sw_1")]
    );
    const availability = await availableLicenses("org_1", "sw_1");
    expect(availability).toEqual({
      softwareId: "sw_1",
      softwareName: "Revit",
      total: 5,
      assignedCount: 3,
      externos: 0,
      available: 2,
    });
  });

  it("software inexistente → null", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    selectQueue.push([]);
    const availability = await availableLicenses("org_1", "sw_x");
    expect(availability).toBeNull();
  });
});

describe("assignLicense (T028, FR-003)", () => {
  it("con available === 0 y sin licencia previa, rechaza 409 no_stock", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }], // enrollment existe
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }], // equipo (0089)
      [{ name: "Revit", total: 2 }], // software
      [ocupada("sw_1"), ocupada("sw_1")], // 2 ocupadas === total → available 0
      [] // sin license previa
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "no_stock",
      message: "No hay licencias disponibles de Revit en Uruguay ATC",
    });
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });

  it("con stock disponible y sin licencia previa, inserta la licencia asignada", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }], // equipo (0089)
      [{ name: "Revit", total: 5 }],
      [ocupada("sw_1")], // 1 ocupada → available = 4
      [] // sin license previa
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    const values = inserts[0]!.values as { assigned: boolean; softwareId: string };
    expect(values.assigned).toBe(true);
    expect(values.softwareId).toBe("sw_1");
  });

  it("inscripción inexistente → 404", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push([]); // enrollment no encontrado
    const result = await assignLicense("org_1", "enr_x", "sw_1", "team_uy");
    expect(result).toEqual({
      ok: false,
      status: 404,
      code: "not_found",
      message: "Inscripción no encontrada",
    });
  });

  it("reasignar el MISMO software ya asignado es idempotente (no descuenta de nuevo)", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }], // equipo (0089)
      [{ name: "Revit", total: 5 }],
      [{ n: 5 }], // available = 0, pero ya está asignada a este enrollment
      [{ id: "lic_1", enrollmentId: "enr_1", softwareId: "sw_1", teamId: "team_uy", assigned: true, assignedAt: new Date() }]
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(0);
  });
});

/**
 * 2026-10-23 — "Tenía licencia propia": no se le presta una. Se rechaza antes
 * de mirar el stock (422 `licencia_propia`), también en la hija de un módulo
 * cuya madre la tiene marcada.
 */
describe("assignLicense con licencia propia", () => {
  it("la inscripción con la marca → 422 licencia_propia, sin tocar nada", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push([{ id: "enr_1", parentEnrollmentId: null, hadOwnLicense: true }]);
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(result).toMatchObject({ ok: false, status: 422, code: "licencia_propia" });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
    expect(selectQueue).toHaveLength(0);
  });

  it("la hija de un módulo cuya madre tiene la marca → 422 licencia_propia", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_hija", parentEnrollmentId: "enr_madre", hadOwnLicense: false }],
      [{ hadOwnLicense: true }]
    );
    const result = await assignLicense("org_1", "enr_hija", "sw_1", "team_uy");
    expect(result).toMatchObject({ ok: false, status: 422, code: "licencia_propia" });
    expect(inserts).toHaveLength(0);
  });
});

describe("034 (FR-020) — varias licencias por inscripción", () => {
  it("un segundo programa AGREGA una licencia: no mueve la que había", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1", parentEnrollmentId: null }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }], // equipo (0089)
      [{ name: "Navisworks", total: 5 }],
      [], // nada ocupado de Navisworks
      [] // no hay fila de ESTE programa (la de Revit no se mira)
    );
    const result = await assignLicense("org_1", "enr_1", "sw_navis", "team_uy");
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(0);
    expect(inserts).toHaveLength(1);
    expect((inserts[0]!.values as { softwareId: string }).softwareId).toBe("sw_navis");
  });

  it("una licencia liberada del mismo programa se REACTIVA, sin duplicar la fila", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1", parentEnrollmentId: null }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }], // equipo (0089)
      [{ name: "Revit", total: 5 }],
      [],
      [{ id: "lic_1", enrollmentId: "enr_1", softwareId: "sw_1", assigned: false, assignedAt: null }]
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(1);
    expect((updates[0]!.set as { assigned: boolean }).assigned).toBe(true);
  });

  it("avisa (sin bloquear) del programa repetido entre el paquete y un módulo", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_hija", parentEnrollmentId: "enr_madre" }],
      [{ hadOwnLicense: false }], // 2026-10-23 — la madre no trajo la suya
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }], // equipo (0089)
      [{ name: "Revit", total: 5 }],
      [],
      [],
      [
        { enrollmentId: "enr_madre", softwareId: "sw_1", softwareName: "Revit" },
        { enrollmentId: "enr_hija", softwareId: "sw_1", softwareName: "Revit" },
      ]
    );
    const result = await assignLicense("org_1", "enr_hija", "sw_1", "team_uy");
    expect(result.ok && result.warnings).toEqual(["Revit"]);
  });
});

/**
 * 035 (FR-008) — Con el programa asignado al grupo de la cohorte, asignarlo o
 * liberarlo por alumno se rechaza con 409, sin escribir nada.
 */
describe("035 — lo del grupo no se toca por alumno", () => {
  it("asignar un programa del grupo → 409 asignado_al_grupo", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1", parentEnrollmentId: null, cohortId: "coh_1" }],
      [{ cohortId: "coh_1", softwareId: "sw_1", name: "Revit", expiresAt: null }]
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(result).toEqual({
      ok: false,
      status: 409,
      code: "asignado_al_grupo",
      message:
        "Revit está asignado al grupo: se asigna y se quita desde el grupo, no por alumno.",
    });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("otro programa en la misma cohorte se asigna como siempre", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1", parentEnrollmentId: null, cohortId: "coh_1" }],
      [{ cohortId: "coh_1", softwareId: "sw_revit", name: "Revit", expiresAt: null }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }], // equipo (0089)
      [{ name: "Navisworks", total: 5 }],
      [],
      []
    );
    const result = await assignLicense("org_1", "enr_1", "sw_navis", "team_uy");
    expect(result.ok).toBe(true);
    expect((inserts[0]!.values as { source: string }).source).toBe("individual");
  });

  it("liberar un programa del grupo → 409, sin escribir", async () => {
    const { unassignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ cohortId: "coh_1" }],
      [{ cohortId: "coh_1", softwareId: "sw_1", name: "Revit", expiresAt: null }]
    );
    const result = await unassignLicense("org_1", "enr_1", "sw_1");
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe("asignado_al_grupo");
    expect(updates).toHaveLength(0);
  });
});

describe("unassignLicense (T028, FR-002 escenario 3)", () => {
  it("libera la licencia asignada (assigned=false, assignedAt=null)", async () => {
    const { unassignLicense } = await import("@/server/licenses");
    const result = await unassignLicense("org_1", "enr_1");
    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as { assigned: boolean; assignedAt: null };
    expect(set.assigned).toBe(false);
    expect(set.assignedAt).toBeNull();
    expect(result).not.toBeNull();
  });
});

describe("countAssignedLicenses (T031, FR-004)", () => {
  it("cuenta las OCUPADAS, no las asignadas alguna vez", async () => {
    const { countAssignedLicenses } = await import("@/server/licenses");
    selectQueue.push([ocupada("sw_1"), ocupada("sw_1"), ocupada("sw_1"), ocupada("sw_1")]);
    const n = await countAssignedLicenses("org_1", "sw_1");
    expect(n).toBe(4);
  });

  /**
   * 023 — **El pedido del dueño**: "cuando termina un curso, libere esas
   * licencias". Antes estas cuatro seguían contando para siempre.
   */
  it("las de cursos terminados NO cuentan", async () => {
    const { countAssignedLicenses } = await import("@/server/licenses");
    selectQueue.push([
      ocupada("sw_1"),
      liberada("sw_1"),
      liberada("sw_1"),
      liberada("sw_1"),
    ]);
    expect(await countAssignedLicenses("org_1", "sw_1")).toBe(1);
  });
});

/**
 * 2026-10-05 — Una licencia asignada cuya inscripción NO tiene cohorte (o
 * cuya cohorte no tiene fechas conocidas) dejaba de contar, y el stock
 * disponible se inflaba en silencio. La intención de 023 es más angosta: solo
 * se libera la licencia de una cohorte que se SABE terminada, o la vencida.
 * Fechas desconocidas = no terminó.
 */
describe("licenciaOcupada — fechas desconocidas no liberan (2026-10-05)", () => {
  const AHORA = new Date("2026-10-05T12:00:00.000Z");
  const asignada = { assigned: true, expiresAt: null };

  it("asignada y sin cohorte → ocupa", async () => {
    const { licenciaOcupada } = await import("@/server/licenses");
    expect(licenciaOcupada(asignada, null, AHORA)).toBe(true);
  });

  it("asignada y cohorte sin fechas → ocupa", async () => {
    const { licenciaOcupada } = await import("@/server/licenses");
    expect(licenciaOcupada(asignada, { startDate: null, endDate: null }, AHORA)).toBe(true);
  });

  it("cohorte terminada → no ocupa", async () => {
    const { licenciaOcupada } = await import("@/server/licenses");
    expect(
      licenciaOcupada(asignada, { startDate: TERMINADA, endDate: TERMINADA }, AHORA)
    ).toBe(false);
  });

  it("vencida → no ocupa aunque la cohorte siga en curso", async () => {
    const { licenciaOcupada } = await import("@/server/licenses");
    expect(
      licenciaOcupada(
        { assigned: true, expiresAt: TERMINADA },
        { startDate: TERMINADA, endDate: VIVA },
        AHORA
      )
    ).toBe(false);
  });

  it("no asignada → no ocupa", async () => {
    const { licenciaOcupada } = await import("@/server/licenses");
    expect(licenciaOcupada({ assigned: false, expiresAt: null }, null, AHORA)).toBe(false);
  });

  it("contarOcupadas cuenta la asignada de una inscripción sin cohorte", async () => {
    const { countAssignedLicenses } = await import("@/server/licenses");
    selectQueue.push([
      ocupada("sw_1"),
      { softwareId: "sw_1", assigned: true, expiresAt: null, startDate: null, endDate: null },
      liberada("sw_1"),
    ]);
    expect(await countAssignedLicenses("org_1", "sw_1")).toBe(2);
  });

  it("el inventario del home aplica la misma regla", async () => {
    selectQueue.push(
      [{ id: "sw_1", name: "Revit", total: 3 }],
      [{ softwareId: "sw_1", assigned: true, expiresAt: null, startDate: null, endDate: null }]
    );
    const { listLicenseInventory } = await import("@/server/licenses");
    expect(await listLicenseInventory("org_1")).toEqual([
      { softwareId: "sw_1", softwareName: "Revit", total: 3, assignedCount: 1, externos: 0, available: 2 },
    ]);
  });
});

describe("updateSoftware (0089)", () => {
  it("edita el nombre; el cupo ya no es del programa sino de cada equipo", async () => {
    const { updateSoftware } = await import("@/server/software");
    const result = await updateSoftware("org_1", "sw_1", { name: "Revit 2027" });
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]!.set).not.toHaveProperty("totalLicenses");
  });
});

/**
 * 005 iteración 2 (home, widget de licencias, pedido en vivo del dueño) —
 * total vs. disponibles por software, sin depender de `listSoftware` de
 * `@/server/software` (evita el ciclo software.ts → licenses.ts).
 */
describe("listLicenseInventory (iteración 2)", () => {
  it("cruza total por software con asignadas agrupadas por softwareId", async () => {
    selectQueue.push(
      [
        { id: "sw_1", name: "Revit", total: 5 },
        { id: "sw_2", name: "Civil3D", total: 2 },
      ],
      [ocupada("sw_1"), ocupada("sw_1"), ocupada("sw_1")]
    );
    const { listLicenseInventory } = await import("@/server/licenses");
    const inventory = await listLicenseInventory("org_1");

    expect(inventory).toEqual([
      { softwareId: "sw_1", softwareName: "Revit", total: 5, assignedCount: 3, externos: 0, available: 2 },
      { softwareId: "sw_2", softwareName: "Civil3D", total: 2, assignedCount: 0, externos: 0, available: 2 },
    ]);
  });

  it("sin software cargado, devuelve un arreglo vacío sin consultar asignadas", async () => {
    selectQueue.push([]);
    const { listLicenseInventory } = await import("@/server/licenses");
    const inventory = await listLicenseInventory("org_1");
    expect(inventory).toEqual([]);
  });
});

/**
 * 0089 — Licencias por EQUIPO (Uruguay ATC, Paraguay ATC…): cada licencia
 * descuenta del cupo del equipo elegido al asignarla.
 */
describe("0089 — stock por equipo", () => {
  it("availableLicenses con teamId usa el cupo de ESE equipo y sus ocupadas", async () => {
    const { availableLicenses } = await import("@/server/licenses");
    // Uruguay tiene 50 y 3 ocupadas: 47 libres, sin importar lo que tenga Paraguay.
    selectQueue.push(
      [{ name: "Revit", total: 50 }],
      [ocupada("sw_1"), ocupada("sw_1"), ocupada("sw_1")]
    );
    expect(await availableLicenses("org_1", "sw_1", "team_uy")).toEqual({
      softwareId: "sw_1",
      softwareName: "Revit",
      total: 50,
      assignedCount: 3,
      externos: 0,
      available: 47,
    });
  });

  it("Uruguay lleno NO bloquea a Paraguay: cada equipo se mide con su propio cupo", async () => {
    const { assignLicense } = await import("@/server/licenses");
    // Uruguay: cupo 2, 2 ocupadas → 409.
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ id: "team_uy", name: "Uruguay ATC", archivedAt: null }],
      [{ name: "Revit", total: 2 }],
      [ocupada("sw_1"), ocupada("sw_1")],
      []
    );
    const lleno = await assignLicense("org_1", "enr_1", "sw_1", "team_uy");
    expect(lleno).toMatchObject({ ok: false, status: 409, code: "no_stock" });
    expect(!lleno.ok && lleno.message).toContain("Uruguay ATC");

    // Paraguay: cupo 60, 0 ocupadas → asigna, y la fila queda atada a Paraguay.
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ id: "team_py", name: "Paraguay ATC", archivedAt: null }],
      [{ name: "Revit", total: 60 }],
      [],
      []
    );
    const libre = await assignLicense("org_1", "enr_1", "sw_1", "team_py");
    expect(libre.ok).toBe(true);
    expect((inserts[0]!.values as { teamId: string }).teamId).toBe("team_py");
  });

  it("un equipo inexistente (o de otra organización) → 422 sin tocar el stock", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push([{ id: "enr_1" }], []); // la inscripción existe, el equipo no
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_ajeno");
    expect(result).toEqual({
      ok: false,
      status: 422,
      code: "invalid_body",
      message: "Equipo de licencias inexistente",
    });
    expect(inserts).toHaveLength(0);
    expect(updates).toHaveLength(0);
  });

  it("un equipo archivado no se ofrece: 422", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ id: "team_viejo", name: "Viejo", archivedAt: new Date() }]
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_viejo");
    expect(result).toMatchObject({ ok: false, status: 422, code: "invalid_body" });
    expect(inserts).toHaveLength(0);
  });

  it("el mismo programa ya asignado desde OTRO equipo no es idempotente: pasa a este y pide stock acá", async () => {
    const { assignLicense } = await import("@/server/licenses");
    selectQueue.push(
      [{ id: "enr_1" }],
      [{ id: "team_py", name: "Paraguay ATC", archivedAt: null }],
      [{ name: "Revit", total: 1 }],
      [], // Paraguay sin ocupadas
      [
        {
          id: "lic_1",
          enrollmentId: "enr_1",
          softwareId: "sw_1",
          teamId: "team_uy",
          assigned: true,
          assignedAt: new Date(),
        },
      ]
    );
    const result = await assignLicense("org_1", "enr_1", "sw_1", "team_py");
    expect(result.ok).toBe(true);
    expect(inserts).toHaveLength(0);
    expect((updates[0]!.set as { teamId: string }).teamId).toBe("team_py");
  });

  it("el inventario del inicio suma los equipos activos", async () => {
    selectQueue.push(
      [{ id: "sw_1", name: "Revit", total: 110 }], // 50 Uruguay + 60 Paraguay
      [ocupada("sw_1"), ocupada("sw_1")]
    );
    const { listLicenseInventory } = await import("@/server/licenses");
    expect(await listLicenseInventory("org_1")).toEqual([
      { softwareId: "sw_1", softwareName: "Revit", total: 110, assignedCount: 2, externos: 0, available: 108 },
    ]);
  });
});
