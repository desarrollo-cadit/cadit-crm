import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { companyPatchSchema, resolverEmpresa, type CompanyFields } from "@/lib/company";

/**
 * 046 US8 (T066; FR-029, FR-030) — Las dos banderas de los reportes:
 * "Gratuito: no cuenta como venta" (curso) y "Excluir de los reportes"
 * (empresa). Default false; se editan con el resto del curso y de la empresa.
 */

vi.mock("@/lib/db", () => ({ getDb: () => ({}), schema: {} }));
const { courseContentSchema } = await import("@/server/courses");

describe("curso — Gratuito", () => {
  const schema = z.object(courseContentSchema).strict();
  it("acepta isFree en el alta y la edición", () => {
    expect(schema.parse({ isFree: true })).toEqual({ isFree: true });
    expect(schema.safeParse({ isFree: "si" }).success).toBe(false);
  });
});

const BASE: CompanyFields = {
  legalName: "Constructora Ficticia SA",
  tradeName: null,
  taxId: null,
  addressStreet: null,
  addressCity: null,
  addressState: null,
  addressCountry: null,
  billingContactName: null,
  billingEmail: null,
  billingPhone: null,
  paymentTerms: null,
  paymentTermDays: null,
  notes: null,
  excludeFromReports: false,
};

describe("empresa — Excluir de los reportes", () => {
  it("se acepta en la edición", () => {
    expect(companyPatchSchema.parse({ excludeFromReports: true })).toEqual({ excludeFromReports: true });
  });

  it("una empresa nueva no se excluye por defecto", () => {
    const r = resolverEmpresa(null, { legalName: "Otra" });
    expect(r.ok && r.data.excludeFromReports).toBe(false);
  });

  it("marcar y desmarcar; editar otro campo conserva la marca", () => {
    const marcada = resolverEmpresa(BASE, { excludeFromReports: true });
    expect(marcada.ok && marcada.data.excludeFromReports).toBe(true);
    const otroCampo = resolverEmpresa({ ...BASE, excludeFromReports: true }, { notes: "convenio" });
    expect(otroCampo.ok && otroCampo.data.excludeFromReports).toBe(true);
    const desmarcada = resolverEmpresa({ ...BASE, excludeFromReports: true }, { excludeFromReports: false });
    expect(desmarcada.ok && desmarcada.data.excludeFromReports).toBe(false);
  });
});
