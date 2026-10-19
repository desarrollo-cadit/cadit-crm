import { describe, expect, it } from "vitest";
import {
  cambiaElRut,
  companyCreateSchema,
  companyPatchSchema,
  esUruguay,
  normalizarRut,
  resolverEmpresa,
  type CompanyFields,
} from "@/lib/company";

/**
 * 040 — Los datos de una empresa, tal como los necesita Administración para
 * facturar. Reglas puras: qué se acepta, cómo se normaliza y qué se rechaza.
 */

const VACIA: CompanyFields = {
  legalName: "Constructora del Este S.A.",
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
};

describe("esUruguay — el país que decide cómo se valida el RUT", () => {
  it.each(["Uruguay", "uruguay", " URUGUAY ", "UY", "uy", "República Oriental del Uruguay", "ROU"])(
    "%s es Uruguay",
    (pais) => {
      expect(esUruguay(pais)).toBe(true);
    }
  );

  it.each([null, "", "Argentina", "Paraguay", "USA"])("%s no es Uruguay", (pais) => {
    expect(esUruguay(pais)).toBe(false);
  });
});

describe("normalizarRut — para comparar, no para guardar", () => {
  it("se queda con letras y dígitos, en mayúsculas", () => {
    expect(normalizarRut("21.234.567-0018")).toBe("212345670018");
    expect(normalizarRut(" 21 234567 0018 ")).toBe("212345670018");
    expect(normalizarRut("cuit 30-1234-x")).toBe("CUIT301234X");
  });

  it("dos escrituras del mismo RUT son el mismo RUT", () => {
    expect(cambiaElRut("21.234.567-0018", "212345670018")).toBe(false);
    expect(cambiaElRut(null, "")).toBe(false);
    expect(cambiaElRut("212345670018", "212345670019")).toBe(true);
    expect(cambiaElRut(null, "212345670018")).toBe(true);
  });
});

describe("resolverEmpresa — alta", () => {
  it("recorta y convierte los textos vacíos en NULL", () => {
    const r = resolverEmpresa(null, {
      legalName: "  Constructora del Este S.A.  ",
      tradeName: "   ",
      billingEmail: "",
      notes: " paga por transferencia ",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.legalName).toBe("Constructora del Este S.A.");
    expect(r.data.tradeName).toBeNull();
    expect(r.data.billingEmail).toBeNull();
    expect(r.data.notes).toBe("paga por transferencia");
  });

  it("la razón social es obligatoria", () => {
    const r = resolverEmpresa(null, { legalName: "   " });
    expect(r).toMatchObject({ ok: false, status: 422, code: "razon_social_obligatoria" });
  });

  it("Uruguay: el RUT tiene 12 dígitos (con puntos, guiones o espacios al escribirlo)", () => {
    for (const rut of ["212345670018", "21.234.567.0018", "21 234567 0018", "21-234567-0018"]) {
      const r = resolverEmpresa(null, { legalName: "X", taxId: rut, addressCountry: "Uruguay" });
      expect(r.ok, rut).toBe(true);
    }
  });

  it("Uruguay: un RUT que no tiene 12 dígitos se rechaza", () => {
    for (const rut of ["1234", "2123456700189", "21234567001A"]) {
      const r = resolverEmpresa(null, { legalName: "X", taxId: rut, addressCountry: "UY" });
      expect(r, rut).toMatchObject({ ok: false, status: 422, code: "rut_invalido" });
    }
  });

  it("el RUT se guarda como se escribió (recortado), no normalizado", () => {
    const r = resolverEmpresa(null, {
      legalName: "X",
      taxId: " 21.234.567.0018 ",
      addressCountry: "Uruguay",
    });
    expect(r.ok && r.data.taxId).toBe("21.234.567.0018");
  });

  it("otro país o país vacío: el identificador fiscal es texto libre", () => {
    expect(resolverEmpresa(null, { legalName: "X", taxId: "30-71234567-9", addressCountry: "Argentina" }).ok).toBe(true);
    expect(resolverEmpresa(null, { legalName: "X", taxId: "1234" }).ok).toBe(true);
  });

  it("contado: los días de plazo no se guardan aunque vengan", () => {
    const r = resolverEmpresa(null, { legalName: "X", paymentTerms: "contado", paymentTermDays: 30 });
    expect(r.ok && r.data.paymentTermDays).toBeNull();
  });

  it("crédito: guarda los días; sin días también se acepta (todavía no se sabe)", () => {
    const a = resolverEmpresa(null, { legalName: "X", paymentTerms: "credito", paymentTermDays: 30 });
    expect(a.ok && a.data.paymentTermDays).toBe(30);
    const b = resolverEmpresa(null, { legalName: "X", paymentTerms: "credito" });
    expect(b.ok && b.data.paymentTermDays).toBeNull();
  });

  it("sin condición de pago, tampoco hay días", () => {
    const r = resolverEmpresa(null, { legalName: "X", paymentTermDays: 30 });
    expect(r.ok && r.data.paymentTermDays).toBeNull();
  });
});

describe("resolverEmpresa — edición (lo que no viene, queda)", () => {
  const ACTUAL: CompanyFields = {
    ...VACIA,
    taxId: "212345670018",
    addressCountry: "Uruguay",
    paymentTerms: "credito",
    paymentTermDays: 30,
    billingEmail: "facturas@este.com.uy",
  };

  it("conserva lo que no se manda", () => {
    const r = resolverEmpresa(ACTUAL, { addressCity: "Maldonado" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data).toMatchObject({
      legalName: ACTUAL.legalName,
      taxId: "212345670018",
      paymentTermDays: 30,
      billingEmail: "facturas@este.com.uy",
      addressCity: "Maldonado",
    });
  });

  it("`null` borra un campo", () => {
    const r = resolverEmpresa(ACTUAL, { billingEmail: null });
    expect(r.ok && r.data.billingEmail).toBeNull();
  });

  it("pasar a contado borra los días", () => {
    const r = resolverEmpresa(ACTUAL, { paymentTerms: "contado" });
    expect(r.ok && r.data.paymentTermDays).toBeNull();
  });

  it("el RUT se valida contra el país que queda (el de antes si no cambia)", () => {
    expect(resolverEmpresa(ACTUAL, { taxId: "123" })).toMatchObject({ ok: false, code: "rut_invalido" });
    expect(resolverEmpresa(ACTUAL, { taxId: "123", addressCountry: "Brasil" }).ok).toBe(true);
  });

  it("un RUT histórico mal cargado no bloquea editar otra cosa", () => {
    const viejo = { ...ACTUAL, taxId: "1234" };
    expect(resolverEmpresa(viejo, { addressCity: "Punta del Este" }).ok).toBe(true);
  });
});

describe("los esquemas Zod de la API", () => {
  it("el alta exige razón social", () => {
    expect(companyCreateSchema.safeParse({}).success).toBe(false);
    expect(companyCreateSchema.safeParse({ legalName: "X" }).success).toBe(true);
  });

  it("la edición acepta un solo campo", () => {
    expect(companyPatchSchema.safeParse({ notes: "x" }).success).toBe(true);
  });

  it("rechaza un correo de facturación con mal formato", () => {
    expect(companyCreateSchema.safeParse({ legalName: "X", billingEmail: "no-es-correo" }).success).toBe(false);
    expect(companyCreateSchema.safeParse({ legalName: "X", billingEmail: "" }).success).toBe(true);
  });

  it("condición de pago cerrada y días entre 1 y 365", () => {
    expect(companyPatchSchema.safeParse({ paymentTerms: "canje" }).success).toBe(false);
    expect(companyPatchSchema.safeParse({ paymentTermDays: 0 }).success).toBe(false);
    expect(companyPatchSchema.safeParse({ paymentTermDays: 366 }).success).toBe(false);
    expect(companyPatchSchema.safeParse({ paymentTermDays: 60 }).success).toBe(true);
  });
});
