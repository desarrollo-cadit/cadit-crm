import { describe, expect, it } from "vitest";
import {
  NOTAS_SEPARADOR,
  datosDeEmpresaVacios,
  lineasDeConteosDeEmpresas,
  planDeUnificacionDeEmpresas,
  reapuntarFiltrosDeEmpresa,
  unificarEmpresasBodySchema,
  vistaPreviaDeEmpresas,
  vistaPreviaEmpresasQuerySchema,
  type EmpresaAUnificar,
} from "@/lib/company-merge";

/**
 * 2026-10-29 — Unificar empresas: las reglas, sin base.
 *
 * Queda la empresa en la que está la persona; la otra se absorbe y se borra.
 * Los datos se COMPLETAN, nunca se pisan; la condición de pago viaja como
 * PAR; las notas se juntan; dos RUT distintos bloquean.
 */

const vacia: EmpresaAUnificar = {
  id: "cia_x",
  legalName: "X",
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

const queda: EmpresaAUnificar = {
  ...vacia,
  id: "cia_queda",
  legalName: "Constructora del Sur S.A.",
  taxId: "21.234.567-0018",
  addressCity: "Montevideo",
  billingEmail: "facturas@delsur.com.uy",
};

const duplicada: EmpresaAUnificar = {
  ...vacia,
  id: "cia_dup",
  legalName: "Constructora Del Sur",
  tradeName: "Del Sur",
  taxId: null,
  addressCity: "Canelones",
  addressStreet: "Av. Italia 1234",
  billingEmail: "otra@delsur.com.uy",
  billingPhone: "099123456",
};

const campo = (plan: ReturnType<typeof planDeUnificacionDeEmpresas>, c: string) =>
  plan.campos.find((f) => f.campo === c);

describe("planDeUnificacionDeEmpresas — quién queda", () => {
  it("queda la empresa pedida (la primera); la otra se absorbe", () => {
    const plan = planDeUnificacionDeEmpresas(queda, duplicada, datosDeEmpresaVacios());
    expect(plan.keptId).toBe("cia_queda");
    expect(plan.absorbedId).toBe("cia_dup");
    expect(plan.bloqueos).toEqual([]);
  });

  it("invertir el orden invierte quién queda", () => {
    const plan = planDeUnificacionDeEmpresas(duplicada, queda, datosDeEmpresaVacios());
    expect(plan.keptId).toBe("cia_dup");
    expect(plan.absorbedId).toBe("cia_queda");
  });

  it("la misma empresa consigo misma bloquea", () => {
    const plan = planDeUnificacionDeEmpresas(queda, queda, datosDeEmpresaVacios());
    expect(plan.bloqueos.map((b) => b.code)).toContain("misma_empresa");
  });
});

describe("planDeUnificacionDeEmpresas — datos: completar, nunca pisar", () => {
  const plan = planDeUnificacionDeEmpresas(queda, duplicada, datosDeEmpresaVacios());

  it("lo que tiene la que queda no se pisa", () => {
    expect(plan.empresa).not.toHaveProperty("legalName");
    expect(plan.empresa).not.toHaveProperty("addressCity");
    expect(plan.empresa).not.toHaveProperty("billingEmail");
    expect(campo(plan, "ciudad")?.resultado).toBe("Montevideo");
    expect(campo(plan, "correo")?.resultado).toBe("facturas@delsur.com.uy");
  });

  it("lo vacío se completa con lo de la absorbida", () => {
    expect(plan.empresa).toMatchObject({
      tradeName: "Del Sur",
      addressStreet: "Av. Italia 1234",
      billingPhone: "099123456",
    });
    expect(campo(plan, "nombre_comercial")).toMatchObject({
      queda: null,
      absorbido: "Del Sur",
      resultado: "Del Sur",
    });
  });

  it("el RUT de la absorbida completa uno vacío", () => {
    const p = planDeUnificacionDeEmpresas(duplicada, queda, datosDeEmpresaVacios());
    expect(p.empresa.taxId).toBe("21.234.567-0018");
    expect(p.bloqueos).toEqual([]);
  });

  it("un texto en blanco cuenta como vacío", () => {
    const p = planDeUnificacionDeEmpresas({ ...queda, tradeName: "   " }, duplicada, datosDeEmpresaVacios());
    expect(p.empresa.tradeName).toBe("Del Sur");
  });

  it("sin nada que completar, no cambia nada", () => {
    const p = planDeUnificacionDeEmpresas(queda, { ...vacia, id: "cia_v" }, datosDeEmpresaVacios());
    expect(p.empresa).toEqual({});
  });
});

describe("planDeUnificacionDeEmpresas — condición de pago, siempre de a PAR", () => {
  it("la que queda tiene condición: queda su par, aunque la otra tenga días", () => {
    const p = planDeUnificacionDeEmpresas(
      { ...queda, paymentTerms: "contado", paymentTermDays: null },
      { ...duplicada, paymentTerms: "credito", paymentTermDays: 30 },
      datosDeEmpresaVacios()
    );
    expect(p.empresa).not.toHaveProperty("paymentTerms");
    expect(p.empresa).not.toHaveProperty("paymentTermDays");
    expect(campo(p, "condicion_de_pago")).toMatchObject({
      queda: "Contado",
      absorbido: "Crédito a 30 días",
      resultado: "Contado",
    });
  });

  it("crédito sin días en la que queda NO toma los días de la otra", () => {
    const p = planDeUnificacionDeEmpresas(
      { ...queda, paymentTerms: "credito", paymentTermDays: null },
      { ...duplicada, paymentTerms: "credito", paymentTermDays: 45 },
      datosDeEmpresaVacios()
    );
    expect(p.empresa).not.toHaveProperty("paymentTermDays");
    expect(campo(p, "condicion_de_pago")?.resultado).toBe("Crédito");
  });

  it("la que queda no tiene condición: viaja el par entero de la absorbida", () => {
    const p = planDeUnificacionDeEmpresas(
      queda,
      { ...duplicada, paymentTerms: "credito", paymentTermDays: 30 },
      datosDeEmpresaVacios()
    );
    expect(p.empresa).toMatchObject({ paymentTerms: "credito", paymentTermDays: 30 });
  });

  it("contado de la absorbida viaja con días NULL (respeta el CHECK)", () => {
    const p = planDeUnificacionDeEmpresas(
      queda,
      { ...duplicada, paymentTerms: "contado", paymentTermDays: null },
      datosDeEmpresaVacios()
    );
    expect(p.empresa).toEqual(expect.objectContaining({ paymentTerms: "contado", paymentTermDays: null }));
  });
});

describe("planDeUnificacionDeEmpresas — notas y «Excluir de los reportes»", () => {
  it("dos notas distintas se juntan, primero la de la que queda, con separador", () => {
    const p = planDeUnificacionDeEmpresas(
      { ...queda, notes: "Factura a fin de mes." },
      { ...duplicada, notes: "Pide orden de compra." },
      datosDeEmpresaVacios()
    );
    expect(p.empresa.notes).toBe(
      `Factura a fin de mes.${NOTAS_SEPARADOR("Constructora Del Sur")}Pide orden de compra.`
    );
    expect(p.empresa.notes!.indexOf("Factura")).toBeLessThan(p.empresa.notes!.indexOf("Pide"));
  });

  it("notas iguales no se repiten", () => {
    const p = planDeUnificacionDeEmpresas(
      { ...queda, notes: "Igual" },
      { ...duplicada, notes: " Igual " },
      datosDeEmpresaVacios()
    );
    expect(p.empresa).not.toHaveProperty("notes");
  });

  it("sin nota propia, toma la de la absorbida tal cual", () => {
    const p = planDeUnificacionDeEmpresas(queda, { ...duplicada, notes: "Solo esta" }, datosDeEmpresaVacios());
    expect(p.empresa.notes).toBe("Solo esta");
  });

  it("«Excluir de los reportes»: gana la que queda, y la vista previa muestra los dos", () => {
    const p = planDeUnificacionDeEmpresas(
      { ...queda, excludeFromReports: false },
      { ...duplicada, excludeFromReports: true },
      datosDeEmpresaVacios()
    );
    expect(p.empresa).not.toHaveProperty("excludeFromReports");
    expect(campo(p, "excluir_de_reportes")).toMatchObject({ queda: "No", absorbido: "Sí", resultado: "No" });
  });
});

describe("planDeUnificacionDeEmpresas — RUT", () => {
  it("dos RUT distintos bloquean: pueden ser dos empresas distintas", () => {
    const p = planDeUnificacionDeEmpresas(queda, { ...duplicada, taxId: "219999990011" }, datosDeEmpresaVacios());
    expect(p.bloqueos).toHaveLength(1);
    expect(p.bloqueos[0]!.code).toBe("rut_distinto");
    expect(p.bloqueos[0]!.mensaje).toMatch(/pueden ser dos empresas distintas/);
  });

  it("el mismo RUT escrito distinto NO bloquea (se compara normalizado)", () => {
    const p = planDeUnificacionDeEmpresas(queda, { ...duplicada, taxId: "212345670018" }, datosDeEmpresaVacios());
    expect(p.bloqueos).toEqual([]);
    expect(p.empresa).not.toHaveProperty("taxId");
  });
});

describe("planDeUnificacionDeEmpresas — lo que se mueve", () => {
  it("cuenta contactos, inscripciones, accesos offline, cursadas históricas y filtros", () => {
    const p = planDeUnificacionDeEmpresas(queda, duplicada, {
      ...datosDeEmpresaVacios(),
      conteos: { contactos: 3, inscripciones: 2, accesosOffline: 1, cursadasHistoricas: 4 },
      filtros: [
        { tabla: "marketing_audience", id: "aud_1", filters: { v: 1, companyIds: ["cia_dup"] } },
        { tabla: "marketing_campaign", id: "mc_1", filters: { v: 1, companyIds: ["cia_dup", "cia_queda"] } },
      ],
    });
    expect(p.conteos).toEqual({
      contactos: 3,
      inscripciones: 2,
      accesosOffline: 1,
      cursadasHistoricas: 4,
      filtrosDeMarketing: 2,
    });
    expect(p.filtros).toEqual([
      { tabla: "marketing_audience", id: "aud_1", filters: { v: 1, companyIds: ["cia_queda"] } },
      { tabla: "marketing_campaign", id: "mc_1", filters: { v: 1, companyIds: ["cia_queda"] } },
    ]);
    expect(lineasDeConteosDeEmpresas(p.conteos)).toEqual([
      "3 contactos",
      "2 inscripciones",
      "1 acceso a cursos offline",
      "4 cursadas históricas",
      "2 audiencias o campañas en borrador que filtran por la empresa",
    ]);
  });

  it("sin nada que mover, no hay líneas", () => {
    expect(lineasDeConteosDeEmpresas(planDeUnificacionDeEmpresas(queda, duplicada, datosDeEmpresaVacios()).conteos)).toEqual([]);
  });
});

describe("reapuntarFiltrosDeEmpresa", () => {
  it("cambia la absorbida por la que queda, sin repetir y sin tocar lo demás", () => {
    expect(
      reapuntarFiltrosDeEmpresa({ v: 1, companyIds: ["a", "x", "b"], stageIds: ["s"] }, "x", "a")
    ).toEqual({ v: 1, companyIds: ["a", "b"], stageIds: ["s"] });
  });

  it("si no la nombra (o no hay filtros), devuelve null", () => {
    expect(reapuntarFiltrosDeEmpresa({ v: 1, companyIds: ["a"] }, "x", "a")).toBeNull();
    expect(reapuntarFiltrosDeEmpresa({ v: 1 }, "x", "a")).toBeNull();
    expect(reapuntarFiltrosDeEmpresa(null, "x", "a")).toBeNull();
  });
});

describe("vista previa y pedidos", () => {
  it("la vista previa lleva las dos empresas, los campos, los conteos y los bloqueos", () => {
    const plan = planDeUnificacionDeEmpresas(queda, duplicada, datosDeEmpresaVacios());
    const v = vistaPreviaDeEmpresas(queda, duplicada, plan);
    expect(v.queda).toEqual({ id: "cia_queda", legalName: "Constructora del Sur S.A.", taxId: "21.234.567-0018" });
    expect(v.absorbida).toEqual({ id: "cia_dup", legalName: "Constructora Del Sur", taxId: null });
    expect(v.campos.length).toBeGreaterThanOrEqual(13);
    expect(v.bloqueos).toEqual([]);
  });

  it("el POST exige confirmación explícita y el id de la absorbida", () => {
    expect(unificarEmpresasBodySchema.safeParse({ absorbedId: "cia_dup" }).success).toBe(false);
    expect(unificarEmpresasBodySchema.safeParse({ absorbedId: "cia_dup", confirm: true }).success).toBe(true);
    expect(unificarEmpresasBodySchema.safeParse({ absorbedId: "", confirm: true }).success).toBe(false);
  });

  it("la vista previa exige `with`", () => {
    expect(vistaPreviaEmpresasQuerySchema.safeParse({}).success).toBe(false);
    expect(vistaPreviaEmpresasQuerySchema.safeParse({ with: "cia_dup" }).success).toBe(true);
  });
});
