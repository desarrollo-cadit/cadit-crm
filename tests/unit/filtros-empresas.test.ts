import { describe, expect, it } from "vitest";
import {
  coincideEmpresa,
  digitosDeRut,
  filtrarEmpresas,
  inicialesDeEmpresa,
} from "@/lib/company-filters";

/** 2026-10-30 — El buscador de Empresas: razón social, nombre comercial y RUT. */
const acme = { legalName: "Acme Construcciones S.A.", tradeName: "Acme", taxId: "21.234.567-0012" };
const obras = { legalName: "Obras del Sur SRL", tradeName: null, taxId: null };
const ingenieria = { legalName: "Ingeniería Técnica Ltda.", tradeName: "IT Uruguay", taxId: "219999990011" };

describe("coincideEmpresa", () => {
  it("sin búsqueda pasan todas", () => {
    expect(filtrarEmpresas([acme, obras, ingenieria], "  ")).toHaveLength(3);
  });

  it("busca en la razón social y el nombre comercial, sin tildes ni mayúsculas", () => {
    expect(coincideEmpresa(ingenieria, "ingenieria")).toBe(true);
    expect(coincideEmpresa(ingenieria, "uruguay")).toBe(true);
    expect(coincideEmpresa(obras, "uruguay")).toBe(false);
  });

  it("cada palabra en algún campo, en cualquier orden", () => {
    expect(coincideEmpresa(acme, "acme construcciones")).toBe(true);
    expect(coincideEmpresa(acme, "construcciones sur")).toBe(false);
  });

  it("el RUT se encuentra como se cargó y por sus dígitos solos", () => {
    expect(coincideEmpresa(acme, "21.234.567")).toBe(true);
    expect(coincideEmpresa(acme, "212345670012")).toBe(true);
    expect(coincideEmpresa(ingenieria, "21.999.999-0011")).toBe(false);
    expect(coincideEmpresa(ingenieria, "21999999")).toBe(true);
  });

  it("una empresa sin RUT no coincide con una búsqueda de dígitos", () => {
    expect(coincideEmpresa(obras, "2123")).toBe(false);
  });

  it("conserva el orden recibido", () => {
    expect(filtrarEmpresas([ingenieria, acme], "a").map((e) => e.legalName)).toEqual([
      ingenieria.legalName,
      acme.legalName,
    ]);
  });
});

describe("digitosDeRut", () => {
  it("quita la puntuación y sin RUT devuelve null", () => {
    expect(digitosDeRut("21.234.567-0012")).toBe("212345670012");
    expect(digitosDeRut(null)).toBeNull();
    expect(digitosDeRut(" - ")).toBeNull();
  });
});

describe("inicialesDeEmpresa", () => {
  it("prefiere el nombre comercial", () => {
    expect(inicialesDeEmpresa(ingenieria)).toBe("IU");
    expect(inicialesDeEmpresa(acme)).toBe("AC");
  });

  it("saltea la forma societaria y los conectores", () => {
    expect(inicialesDeEmpresa(obras)).toBe("OS");
    expect(inicialesDeEmpresa({ legalName: "Ingeniería Técnica Ltda.", tradeName: null })).toBe("IT");
  });

  it("nunca queda vacío", () => {
    expect(inicialesDeEmpresa({ legalName: "S.A.", tradeName: null })).toBe("SA");
    expect(inicialesDeEmpresa({ legalName: "", tradeName: null })).toBe("?");
  });
});
