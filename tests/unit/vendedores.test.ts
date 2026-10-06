import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, capabilitiesFor } from "@/lib/capabilities";

/**
 * 2026-10-06 (decisiones del dueño) — Vendedores.
 *
 * Administración paga comisiones con este dato, así que las reglas que
 * importan son tres:
 *
 * 1. El vendedor es una ENTIDAD propia (`seller`), no un usuario del panel:
 *    hay quien vende sin entrar nunca al sistema.
 * 2. Toda inscripción EN UNA COHORTE es una venta y lleva vendedor. El lead
 *    sin cohorte (interés) no. La hija de una especialización tampoco: la
 *    venta es la madre, que lleva el paquete.
 * 3. Un vendedor archivado no se elige para una venta NUEVA, pero sigue en
 *    las viejas: editar otra cosa de esa venta no puede obligar a cambiarlo.
 */

const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
const selectQueue: unknown[][] = [];

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
    insert: (table: unknown) => ({
      values: (values: unknown) => {
        inserts.push({ table, values });
        return {
          returning: () =>
            Promise.resolve([
              { createdAt: new Date("2026-10-06T12:00:00Z"), archivedAt: null, ...(values as object) },
            ]),
        };
      },
    }),
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([
                {
                  id: "sel_1",
                  name: "Ana",
                  email: null,
                  userId: null,
                  archivedAt: null,
                  createdAt: new Date("2026-10-01T12:00:00Z"),
                  ...(set as object),
                },
              ]),
          }),
        };
      },
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

beforeEach(() => {
  inserts.length = 0;
  updates.length = 0;
  selectQueue.length = 0;
});

/* ============================================================
 * Las reglas, sin base de datos
 * ============================================================ */

describe("exigeVendedor — qué inscripción es una venta", () => {
  it("inscripción en una cohorte, sin madre: es una venta", async () => {
    const { exigeVendedor } = await import("@/server/sellers");
    expect(exigeVendedor({ cohortId: "coh_1", parentEnrollmentId: null })).toBe(true);
  });

  it("lead sin cohorte (interés): no es una venta todavía", async () => {
    const { exigeVendedor } = await import("@/server/sellers");
    expect(exigeVendedor({ cohortId: null, parentEnrollmentId: null })).toBe(false);
  });

  it("hija de una especialización (módulo): la venta es la madre", async () => {
    const { exigeVendedor } = await import("@/server/sellers");
    expect(exigeVendedor({ cohortId: "coh_mod", parentEnrollmentId: "enr_madre" })).toBe(false);
  });
});

describe("reglaDeVendedorAlEditar — editar una venta existente", () => {
  it("una venta vieja SIN vendedor se puede editar sin cargarlo (no se bloquea lo existente)", async () => {
    const { reglaDeVendedorAlEditar } = await import("@/server/sellers");
    expect(reglaDeVendedorAlEditar({ exige: true, actual: null, nuevo: null })).toBeNull();
  });

  it("a una venta CON vendedor no se le puede quitar", async () => {
    const { reglaDeVendedorAlEditar } = await import("@/server/sellers");
    expect(reglaDeVendedorAlEditar({ exige: true, actual: "sel_1", nuevo: null })).toMatch(
      /vendedor/i
    );
  });

  it("a un lead sin cohorte o a una hija sí se le puede quitar", async () => {
    const { reglaDeVendedorAlEditar } = await import("@/server/sellers");
    expect(reglaDeVendedorAlEditar({ exige: false, actual: "sel_1", nuevo: null })).toBeNull();
  });

  it("cambiar de vendedor está permitido", async () => {
    const { reglaDeVendedorAlEditar } = await import("@/server/sellers");
    expect(reglaDeVendedorAlEditar({ exige: true, actual: "sel_1", nuevo: "sel_2" })).toBeNull();
  });
});

/* ============================================================
 * Alta, edición y archivo
 * ============================================================ */

describe("createSeller", () => {
  it("crea un vendedor que no usa el sistema: nombre y correo, sin usuario", async () => {
    selectQueue.push([]); // ningún vendedor con ese nombre
    const { createSeller } = await import("@/server/sellers");
    const r = await createSeller("org_1", { name: "  Ana Pérez ", email: "ana@example.com" });

    expect(r.ok).toBe(true);
    const values = inserts[0]!.values as Record<string, unknown>;
    expect(values.organizationId).toBe("org_1");
    expect(values.name).toBe("Ana Pérez");
    expect(values.email).toBe("ana@example.com");
    expect(values.userId).toBeNull();
    expect(String(values.id)).toMatch(/^sel_/);
  });

  it("nombre vacío → 422, sin insertar", async () => {
    const { createSeller } = await import("@/server/sellers");
    const r = await createSeller("org_1", { name: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
    expect(inserts).toHaveLength(0);
  });

  it("un usuario que no es miembro de la organización no se puede vincular → 422", async () => {
    selectQueue.push([], []); // nombre libre; userId sin membresía
    const { createSeller } = await import("@/server/sellers");
    const r = await createSeller("org_1", { name: "Ana", userId: "usr_ajeno" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(422);
    expect(inserts).toHaveLength(0);
  });

  it("nombre repetido (entre los activos) → 409 que dice qué está duplicado", async () => {
    selectQueue.push([{ id: "sel_otro" }]);
    const { createSeller } = await import("@/server/sellers");
    const r = await createSeller("org_1", { name: "Ana" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.message).toMatch(/nombre/i);
    }
  });
});

describe("updateSeller — archivar no borra", () => {
  it("archivar pone archived_at; no hay DELETE en ninguna parte", async () => {
    selectQueue.push([{ id: "sel_1", name: "Ana", archivedAt: null }]); // existe
    const { updateSeller } = await import("@/server/sellers");
    const r = await updateSeller("org_1", "sel_1", { archived: true });
    expect(r.ok).toBe(true);
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.archivedAt).toBeInstanceOf(Date);
    if (r.ok) expect(r.seller.archived).toBe(true);
  });

  it("reactivar limpia archived_at", async () => {
    selectQueue.push([{ id: "sel_1", name: "Ana", archivedAt: new Date() }], []);
    const { updateSeller } = await import("@/server/sellers");
    await updateSeller("org_1", "sel_1", { archived: false });
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.archivedAt).toBeNull();
  });

  it("vendedor de otra organización → 404", async () => {
    selectQueue.push([]);
    const { updateSeller } = await import("@/server/sellers");
    const r = await updateSeller("org_1", "sel_ajeno", { name: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
    expect(updates).toHaveLength(0);
  });

  it("el módulo no exporta ninguna forma de borrar un vendedor", async () => {
    const mod = await import("@/server/sellers");
    expect(Object.keys(mod).filter((k) => /delete|borrar|remove/i.test(k))).toEqual([]);
  });
});

/* ============================================================
 * Vendedor obligatorio en cada camino que pone una cohorte
 * ============================================================ */

describe("createEnrollment — una inscripción en cohorte es una venta", () => {
  it("sin vendedor → 422 seller_required, sin insertar nada", async () => {
    selectQueue.push([{ id: "coh_1", parentCohortId: null }]);
    const { createEnrollment } = await import("@/server/enrollments");
    const r = await createEnrollment("org_1", { cohortId: "coh_1", contactId: "ct_1" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.code).toBe("seller_required");
      expect(r.message).toMatch(/vendedor/i);
    }
    expect(inserts).toHaveLength(0);
  });

  it("con un vendedor activo: guarda el id del VENDEDOR", async () => {
    selectQueue.push(
      [{ id: "coh_1", parentCohortId: null }],
      [{ id: "sel_1", archivedAt: null }],
      [{ id: "ct_1", nationalId: null }],
      [{ id: "stg_1" }]
    );
    const { createEnrollment } = await import("@/server/enrollments");
    const r = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "sel_1",
    });
    expect(r.ok).toBe(true);
    expect((inserts[0]!.values as { sellerId: string }).sellerId).toBe("sel_1");
  });

  it("vendedor archivado → 422: no se elige para una venta nueva", async () => {
    selectQueue.push(
      [{ id: "coh_1", parentCohortId: null }],
      [{ id: "sel_1", archivedAt: new Date("2026-09-01") }]
    );
    const { createEnrollment } = await import("@/server/enrollments");
    const r = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "sel_1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/archivad/i);
    expect(inserts).toHaveLength(0);
  });

  it("vendedor de otra organización → 422", async () => {
    selectQueue.push([{ id: "coh_1", parentCohortId: null }], []);
    const { createEnrollment } = await import("@/server/enrollments");
    const r = await createEnrollment("org_1", {
      cohortId: "coh_1",
      contactId: "ct_1",
      sellerId: "sel_ajeno",
    });
    expect(r.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });
});

describe("updateEnrollmentCommercial — editar una venta existente", () => {
  it("venta vieja sin vendedor: guardar otros datos con sellerId null NO se bloquea", async () => {
    selectQueue.push([{ cohortId: "coh_1", parentEnrollmentId: null, sellerId: null }]);
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const r = await updateEnrollmentCommercial("org_1", "enr_1", {
      amount: 1000,
      sellerId: null,
    });
    expect(r.ok).toBe(true);
  });

  it("quitarle el vendedor a una venta → 422, sin actualizar", async () => {
    selectQueue.push([{ cohortId: "coh_1", parentEnrollmentId: null, sellerId: "sel_1" }]);
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const r = await updateEnrollmentCommercial("org_1", "enr_1", { sellerId: null });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("seller_required");
    expect(updates).toHaveLength(0);
  });

  it("conservar un vendedor ya archivado en una venta vieja está permitido", async () => {
    selectQueue.push([{ cohortId: "coh_1", parentEnrollmentId: null, sellerId: "sel_viejo" }]);
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const r = await updateEnrollmentCommercial("org_1", "enr_1", {
      sellerId: "sel_viejo",
      amount: 5,
    });
    expect(r.ok).toBe(true);
  });

  it("cambiar a un vendedor archivado → 422", async () => {
    selectQueue.push(
      [{ cohortId: "coh_1", parentEnrollmentId: null, sellerId: "sel_1" }],
      [{ id: "sel_2", archivedAt: new Date() }]
    );
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const r = await updateEnrollmentCommercial("org_1", "enr_1", { sellerId: "sel_2" });
    expect(r.ok).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("inscripción inexistente al tocar el vendedor → 404", async () => {
    selectQueue.push([]);
    const { updateEnrollmentCommercial } = await import("@/server/enrollments");
    const r = await updateEnrollmentCommercial("org_1", "enr_x", { sellerId: "sel_1" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(404);
  });
});

describe("PATCH /api/pipeline/leads/[id] — pasar un lead a una cohorte", () => {
  function sesion() {
    vi.doMock("@/lib/auth/session", () => {
      class UnauthorizedError extends Error {}
      return {
        UnauthorizedError,
        requireSession: vi.fn().mockResolvedValue({
          userId: "usr_1",
          organizationId: "org_1",
          role: "direccion",
          capabilities: CAPABILITIES,
        }),
      };
    });
  }

  beforeEach(() => {
    vi.resetModules();
  });

  it("un lead sin vendedor no pasa a una cohorte: 422 seller_required, sin actualizar", async () => {
    sesion();
    selectQueue.push(
      [{ id: "coh_1" }], // la cohorte existe
      [{ sellerId: null, parentEnrollmentId: null }] // el lead
    );
    const { PATCH } = await import("@/app/api/pipeline/leads/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/pipeline/leads/enr_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cohortId: "coh_1" }),
      }),
      { params: Promise.resolve({ id: "enr_1" }) }
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("seller_required");
    expect(updates).toHaveLength(0);
  });

  it("mover de etapa (sin cohorte) sigue sin pedir vendedor", async () => {
    sesion();
    selectQueue.push([{ id: "stg_2" }]);
    const { PATCH } = await import("@/app/api/pipeline/leads/[id]/route");
    const res = await PATCH(
      new Request("http://localhost/api/pipeline/leads/enr_1", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId: "stg_2", position: 0 }),
      }),
      { params: Promise.resolve({ id: "enr_1" }) }
    );
    expect(res.status).toBe(200);
  });
});

/* ============================================================
 * El selector de los formularios
 * ============================================================ */

describe("opcionesDeVendedor — qué ofrece el selector", () => {
  const sellers = [
    { id: "sel_b", name: "Bruno", archived: false },
    { id: "sel_a", name: "Ana", archived: false },
    { id: "sel_x", name: "Xavier", archived: true },
  ];

  it("venta nueva: sólo activos, por nombre, sin opción vacía", async () => {
    const { opcionesDeVendedor } = await import("@/lib/vendedores");
    const r = opcionesDeVendedor(sellers, { actual: null, permiteVacio: false });
    expect(r.map((o) => o.id)).toEqual(["sel_a", "sel_b"]);
  });

  it("venta vieja con un vendedor hoy archivado: lo conserva, marcado", async () => {
    const { opcionesDeVendedor } = await import("@/lib/vendedores");
    const r = opcionesDeVendedor(sellers, { actual: "sel_x", permiteVacio: false });
    expect(r.find((o) => o.id === "sel_x")?.label).toMatch(/archivado/i);
  });

  it("venta vieja sin vendedor: ofrece «Sin vendedor» para no obligar", async () => {
    const { opcionesDeVendedor } = await import("@/lib/vendedores");
    const r = opcionesDeVendedor(sellers, { actual: null, permiteVacio: true });
    expect(r[0]).toEqual({ id: "", label: "Sin vendedor" });
  });
});

/* ============================================================
 * El roster: quién ve el vendedor
 * ============================================================ */

describe("buildRosterEntry — el vendedor viaja con los datos comerciales", () => {
  const enrollment = {
    id: "enr_1",
    contactId: "ct_1",
    cohortId: "coh_1",
    parentEnrollmentId: null,
    amount: 1000,
    currency: "UYU",
    installments: 2,
    paymentNotes: null,
    nationalId: null,
    invoiceNumber: null,
    receiptNumber: null,
    sellerId: "sel_1",
    companyId: null,
    termsEmailSentAt: null,
    softwareInstalledAt: null,
    hadOwnLicense: false,
    academiaOnlineAccessAt: null,
    welcomeEmailSentAt: null,
  };
  const contact = {
    id: "ct_1",
    firstName: "Lucía",
    lastName: "Gómez",
    phone: null,
    email: "l@example.com",
    archivedAt: null,
  };
  const seller = { id: "sel_1", name: "Ana", archivedAt: null };

  it("sin `cobranza.ver` el vendedor NO viaja", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const e = buildRosterEntry(
      capabilitiesFor("soporte"),
      enrollment as never,
      contact as never,
      null,
      null,
      seller as never
    );
    expect("seller" in e).toBe(false);
    expect("sellerId" in e).toBe(false);
    expect(JSON.stringify(e)).not.toContain("Ana");
  });

  it("con `cobranza.ver`: nombre del vendedor y si la venta lo exige", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const e = buildRosterEntry(
      CAPABILITIES,
      enrollment as never,
      contact as never,
      null,
      null,
      seller as never
    );
    expect(e.seller).toEqual({ id: "sel_1", name: "Ana", archived: false });
    expect(e.sellerRequired).toBe(true);
  });

  it("venta sin vendedor: `seller` null para que la pantalla diga «Sin vendedor»", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const e = buildRosterEntry(
      CAPABILITIES,
      { ...enrollment, sellerId: null } as never,
      contact as never,
      null,
      null,
      null
    );
    expect(e.seller).toBeNull();
    expect(e.sellerRequired).toBe(true);
  });

  it("la hija de un módulo no exige vendedor (lo lleva la madre)", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const e = buildRosterEntry(
      CAPABILITIES,
      { ...enrollment, parentEnrollmentId: "enr_madre", sellerId: null } as never,
      contact as never,
      null,
      null,
      null
    );
    expect(e.sellerRequired).toBe(false);
  });
});
