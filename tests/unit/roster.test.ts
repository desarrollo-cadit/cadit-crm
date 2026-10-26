import { beforeEach, describe, expect, it, vi } from "vitest";
import { CAPABILITIES, capabilitiesFor } from "@/lib/capabilities";

/**
 * 005 (US3, contracts/cohort-roster.md, T026): el DTO de roster oculta los
 * campos financieros cuando la sesión NO tiene `cobranza.ver` (FR-016, regla
 * dura de servidor) y los incluye cuando sí; `updateChecklist`
 * persiste cada campo del checklist independientemente.
 */

const updates: { table: unknown; set: unknown }[] = [];

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
    update: (table: unknown) => ({
      set: (set: unknown) => {
        updates.push({ table, set });
        return {
          where: () => ({
            returning: () =>
              Promise.resolve([{ id: "enr_1", ...(set as object) }]),
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

/**
 * 2026-10-23 — "Tenía licencia propia" y las licencias del grupo: la
 * verificación y la sincronización viven en `group-licenses.ts` (el único,
 * con `licenses.ts`, que escribe `license`). Acá se mira que
 * `updateChecklist` las llame en el orden correcto.
 */
const verificarMarca = vi.fn();
const sincronizar = vi.fn();
vi.mock("@/server/group-licenses", () => ({
  verificarMarcaDeLicenciaPropia: (...a: unknown[]) => verificarMarca(...a),
  sincronizarRecorrido: (...a: unknown[]) => sincronizar(...a),
  listarProgramasDelGrupo: async () => [],
}));

const baseEnrollment = {
  id: "enr_1",
  amount: 7600000,
  installments: 12,
  paymentNotes: "pagó $20.000, resto en cuotas",
  nationalId: "1.234.567-8",
  invoiceNumber: "819",
  receiptNumber: null,
  sellerId: "usr_1",
  companyId: "cia_1",
  termsEmailSentAt: new Date("2026-08-01"),
  softwareInstalledAt: null,
  hadOwnLicense: false,
  academiaOnlineAccessAt: null,
};

const baseContact = {
  firstName: "Diego",
  lastName: "Fernández",
  phone: "59899123456",
  email: "diego@example.com",
};
const baseLicense = {
  assigned: true,
  assignedAt: new Date("2026-08-02"),
  softwareId: "sw_1",
};

describe("buildRosterEntry — DTO por capacidad (FR-016)", () => {
  it("sin `cobranza.ver`: NUNCA arma los campos financieros en el objeto", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      capabilitiesFor("soporte"),
      baseEnrollment as never,
      baseContact as never,
      baseLicense as never
    );

    expect("amount" in entry).toBe(false);
    expect("installments" in entry).toBe(false);
    expect("paymentNotes" in entry).toBe(false);
    expect("nationalId" in entry).toBe(false);
    expect("invoiceNumber" in entry).toBe(false);
    expect("receiptNumber" in entry).toBe(false);
    expect("sellerId" in entry).toBe(false);
    expect("companyId" in entry).toBe(false);
    // El checklist SÍ es visible para soporte (FR-014/FR-017).
    expect(entry.checklist.licenseAssigned).toBe(true);
    expect(entry.contact.name).toBe("Diego Fernández");
  });

  /**
   * 012 (T029) — Antes este caso recorría NOMBRES de rol ("ventas",
   * "coordinacion"…). Ya no sirve: con los roles editables desde la pantalla,
   * lo que decide es la capacidad, no cómo se llame quien la tenga.
   *
   * Se prueban los tres roles de sistema que hoy tienen `cobranza.ver` más el
   * conjunto completo, para que el caso siga cubriendo varias formas de
   * llegar al mismo permiso.
   */
  it.each([
    ["dirección", capabilitiesFor("owner")],
    ["conjunto completo", CAPABILITIES],
    ["solo lo financiero", ["cobranza.ver"] as const],
  ])(
    "con `cobranza.ver` (%s): incluye los campos financieros",
    async (_nombre, capabilities) => {
      const { buildRosterEntry } = await import("@/server/enrollments");
      const entry = buildRosterEntry(
        capabilities as never,
        baseEnrollment as never,
        baseContact as never,
        baseLicense as never
      );

      expect(entry.amount).toBe(7600000);
      expect(entry.installments).toBe(12);
      expect(entry.nationalId).toBe("1.234.567-8");
      expect(entry.invoiceNumber).toBe("819");
      expect(entry.sellerId).toBe("usr_1");
      expect(entry.companyId).toBe("cia_1");
    }
  );

  it("licenseAssigned se lee de license.assigned, no de un campo propio en enrollment (DV-004)", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const withoutLicense = buildRosterEntry(
      CAPABILITIES,
      baseEnrollment as never,
      baseContact as never,
      null
    );
    expect(withoutLicense.checklist.licenseAssigned).toBe(false);

    const withLicense = buildRosterEntry(
      CAPABILITIES,
      baseEnrollment as never,
      baseContact as never,
      baseLicense as never
    );
    expect(withLicense.checklist.licenseAssigned).toBe(true);
  });

  it("licenseSoftwareId viaja solo cuando la licencia está asignada", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const withLicense = buildRosterEntry(
      CAPABILITIES,
      baseEnrollment as never,
      baseContact as never,
      baseLicense as never
    );
    expect(withLicense.checklist.licenseSoftwareId).toBe("sw_1");

    const unassigned = buildRosterEntry(
      CAPABILITIES,
      baseEnrollment as never,
      baseContact as never,
      { assigned: false, assignedAt: null, softwareId: "sw_1" } as never
    );
    expect(unassigned.checklist.licenseSoftwareId).toBeNull();
  });
});

describe("updateChecklist (T023, FR-013)", () => {
  beforeEach(() => {
    updates.length = 0;
    verificarMarca.mockReset();
    sincronizar.mockReset();
    verificarMarca.mockResolvedValue({ ok: true });
    sincronizar.mockResolvedValue({ sinStock: [] });
  });

  it("persiste cada campo del checklist independientemente, sin tocar los omitidos", async () => {
    const { updateChecklist } = await import("@/server/enrollments");
    const r = await updateChecklist("org_1", "enr_1", {
      termsEmailSentAt: "now",
      hadOwnLicense: true,
    });
    expect(r.ok).toBe(true);

    expect(updates).toHaveLength(1);
    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.termsEmailSentAt).toBeInstanceOf(Date);
    expect(set.hadOwnLicense).toBe(true);
    expect("softwareInstalledAt" in set).toBe(false);
    expect("academiaOnlineAccessAt" in set).toBe(false);
  });

  it("acepta null para desmarcar un campo de fecha", async () => {
    const { updateChecklist } = await import("@/server/enrollments");
    await updateChecklist("org_1", "enr_1", { academiaOnlineAccessAt: null });

    const set = updates[0]!.set as Record<string, unknown>;
    expect(set.academiaOnlineAccessAt).toBeNull();
    // Sin tocar la marca, nada de licencias.
    expect(verificarMarca).not.toHaveBeenCalled();
    expect(sincronizar).not.toHaveBeenCalled();
  });

  it("marcar licencia propia con una licencia individual asignada → 409, sin escribir", async () => {
    verificarMarca.mockResolvedValue({ ok: false, mensaje: "liberala primero" });
    const { updateChecklist } = await import("@/server/enrollments");
    const r = await updateChecklist("org_1", "enr_1", { hadOwnLicense: true });
    expect(r).toEqual({
      ok: false,
      status: 409,
      code: "licencia_asignada",
      message: "liberala primero",
    });
    expect(updates).toHaveLength(0);
    expect(sincronizar).not.toHaveBeenCalled();
  });

  it("marcar licencia propia sincroniza el grupo DESPUÉS de escribir la marca (libera las del grupo)", async () => {
    verificarMarca.mockResolvedValue({ ok: true });
    sincronizar.mockImplementation(async () => {
      expect(updates).toHaveLength(1);
      return { sinStock: [] };
    });
    const { updateChecklist } = await import("@/server/enrollments");
    await updateChecklist("org_1", "enr_1", { hadOwnLicense: true });
    expect(verificarMarca).toHaveBeenCalledWith("org_1", "enr_1");
    expect(sincronizar).toHaveBeenCalledWith("org_1", "enr_1");
  });

  it("desmarcarla no verifica nada y vuelve a dar las del grupo", async () => {
    const { updateChecklist } = await import("@/server/enrollments");
    await updateChecklist("org_1", "enr_1", { hadOwnLicense: false });
    expect(verificarMarca).toHaveBeenCalledTimes(0);
    expect(sincronizar).toHaveBeenCalledTimes(1);
  });
});

/**
 * 2026-10-21 — El correo de la licencia viaja en el roster, como el correo del
 * alumno: para cualquier capacidad que abra el roster, sin pedir `cobranza.ver`.
 */
describe("buildRosterEntry — correo de la licencia", () => {
  it("sin correo propio: el del alumno, sin marca", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      capabilitiesFor("soporte"),
      { ...baseEnrollment, licenseEmail: null } as never,
      baseContact as never,
      baseLicense as never
    );
    expect(entry.licenseEmail).toEqual({ email: "diego@example.com", distinto: false, propio: null });
  });

  it("con correo propio distinto: ese, marcado", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      capabilitiesFor("soporte"),
      { ...baseEnrollment, licenseEmail: "licencias@empresa.uy" } as never,
      baseContact as never,
      baseLicense as never
    );
    expect(entry.licenseEmail).toEqual({
      email: "licencias@empresa.uy",
      distinto: true,
      propio: "licencias@empresa.uy",
    });
  });
});

/**
 * 2026-10-23 — La hija de un módulo no es una venta: la venta (monto, cuotas,
 * vendedor, empresa, factura…) es la MADRE. El roster del módulo la trae
 * para mostrarla y editarla desde ahí, con el MISMO gate que los campos
 * financieros de la fila: sin `cobranza.ver`, no viaja.
 */
describe("buildRosterEntry — la venta de la especialización en la fila del módulo", () => {
  const hija = {
    ...baseEnrollment,
    id: "enr_hija",
    cohortId: "coh_modulo",
    parentEnrollmentId: "enr_madre",
    amount: null,
    installments: null,
    nationalId: null,
    invoiceNumber: null,
    sellerId: null,
    companyId: null,
    currency: "UYU",
  };
  const madre = {
    licenseEmail: null,
    hadOwnLicense: false,
    venta: {
      id: "enr_madre",
      cohortId: "coh_espec",
      parentEnrollmentId: null,
      amount: 12000000,
      currency: "USD",
      installments: 10,
      paymentNotes: "contado",
      nationalId: "4.444.444-4",
      invoiceNumber: "F-77",
      receiptNumber: "R-9",
      sellerId: "sel_1",
      companyId: "cia_9",
      seller: { id: "sel_1", name: "Ana Vendedora", archivedAt: null },
    },
  };

  it("con `cobranza.ver`: trae la venta de la madre, con su id para editarla", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      ["cobranza.ver"] as never,
      hija as never,
      baseContact as never,
      null,
      null,
      null,
      "curso",
      madre as never
    );
    expect(entry.sellerRequired).toBe(false);
    expect(entry.parentSale).toEqual({
      enrollmentId: "enr_madre",
      amount: 12000000,
      currency: "USD",
      installments: 10,
      paymentNotes: "contado",
      nationalId: "4.444.444-4",
      invoiceNumber: "F-77",
      receiptNumber: "R-9",
      sellerId: "sel_1",
      seller: { id: "sel_1", name: "Ana Vendedora", archived: false },
      sellerRequired: true,
      companyId: "cia_9",
    });
  });

  it("sin `cobranza.ver`: la venta de la madre NO viaja", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      capabilitiesFor("soporte"),
      hija as never,
      baseContact as never,
      null,
      null,
      null,
      "curso",
      madre as never
    );
    expect("parentSale" in entry).toBe(false);
    expect(JSON.stringify(entry)).not.toContain("12000000");
    expect(JSON.stringify(entry)).not.toContain("Ana Vendedora");
  });

  it("una inscripción sin madre no lleva venta de especialización", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      CAPABILITIES,
      baseEnrollment as never,
      baseContact as never,
      null
    );
    expect(entry.parentSale ?? null).toBeNull();
  });
});

describe("ventaDeLaFila — qué venta muestra y edita cada fila del roster", () => {
  const fila = {
    id: "enr_hija",
    contact: { id: "ct_1", name: "Diego Fernández", phone: null, email: null, archived: false },
    amount: null,
    currency: "UYU",
    installments: null,
    sellerId: null,
    seller: null,
    sellerRequired: false,
    companyId: null,
  };

  it("fila común: la propia, sin marca", async () => {
    const { ventaDeLaFila } = await import("@/lib/roster-venta");
    const v = ventaDeLaFila({ ...fila, id: "enr_1", sellerRequired: true } as never);
    expect(v.enrollmentId).toBe("enr_1");
    expect(v.deLaEspecializacion).toBe(false);
    expect(v.entry.id).toBe("enr_1");
  });

  it("fila de módulo con la venta de la madre: muestra y edita la madre", async () => {
    const { ventaDeLaFila } = await import("@/lib/roster-venta");
    const v = ventaDeLaFila({
      ...fila,
      parentSale: {
        enrollmentId: "enr_madre",
        amount: 12000000,
        currency: "USD",
        installments: 10,
        paymentNotes: null,
        nationalId: "4.444.444-4",
        invoiceNumber: "F-77",
        receiptNumber: null,
        sellerId: null,
        seller: null,
        sellerRequired: true,
        companyId: "cia_9",
      },
    } as never);
    expect(v.enrollmentId).toBe("enr_madre");
    expect(v.deLaEspecializacion).toBe(true);
    expect(v.entry.amount).toBe(12000000);
    expect(v.entry.currency).toBe("USD");
    expect(v.entry.invoiceNumber).toBe("F-77");
    expect(v.entry.companyId).toBe("cia_9");
    // La madre ES la venta: sin vendedor se ve "Sin vendedor", no "—".
    expect(v.entry.sellerRequired).toBe(true);
    expect(v.entry.seller).toBeNull();
    // El alumno sigue siendo el de la fila.
    expect(v.entry.contact.name).toBe("Diego Fernández");
  });

  it("fila de módulo sin la venta (sin `cobranza.ver`): queda la propia", async () => {
    const { ventaDeLaFila } = await import("@/lib/roster-venta");
    const v = ventaDeLaFila(fila as never);
    expect(v.deLaEspecializacion).toBe(false);
    expect(v.enrollmentId).toBe("enr_hija");
  });
});
