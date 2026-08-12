import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 005 (US3, contracts/cohort-roster.md, T026): el DTO de roster oculta los
 * campos financieros cuando `role === "soporte"` (FR-016, regla dura de
 * servidor) y los incluye para cualquier otro rol; `updateChecklist`
 * persiste cada campo del checklist independientemente.
 */

const updates: { table: unknown; set: unknown }[] = [];

vi.mock("@/lib/db", () => ({
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

const baseEnrollment = {
  id: "enr_1",
  amount: 76000,
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

describe("buildRosterEntry — DTO por rol (FR-016)", () => {
  it("role 'soporte': NUNCA arma los campos financieros en el objeto", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const entry = buildRosterEntry(
      "soporte",
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

  it.each(["member", "owner", "ventas", "coordinacion"])(
    "role '%s' (acceso completo): incluye los campos financieros",
    async (role) => {
      const { buildRosterEntry } = await import("@/server/enrollments");
      const entry = buildRosterEntry(
        role,
        baseEnrollment as never,
        baseContact as never,
        baseLicense as never
      );

      expect(entry.amount).toBe(76000);
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
      "member",
      baseEnrollment as never,
      baseContact as never,
      null
    );
    expect(withoutLicense.checklist.licenseAssigned).toBe(false);

    const withLicense = buildRosterEntry(
      "member",
      baseEnrollment as never,
      baseContact as never,
      baseLicense as never
    );
    expect(withLicense.checklist.licenseAssigned).toBe(true);
  });

  it("licenseSoftwareId viaja solo cuando la licencia está asignada", async () => {
    const { buildRosterEntry } = await import("@/server/enrollments");
    const withLicense = buildRosterEntry(
      "member",
      baseEnrollment as never,
      baseContact as never,
      baseLicense as never
    );
    expect(withLicense.checklist.licenseSoftwareId).toBe("sw_1");

    const unassigned = buildRosterEntry(
      "member",
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
  });

  it("persiste cada campo del checklist independientemente, sin tocar los omitidos", async () => {
    const { updateChecklist } = await import("@/server/enrollments");
    await updateChecklist("org_1", "enr_1", {
      termsEmailSentAt: "now",
      hadOwnLicense: true,
    });

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
  });
});
