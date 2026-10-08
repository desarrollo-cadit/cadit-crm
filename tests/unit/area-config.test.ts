import { describe, expect, it } from "vitest";
import {
  areaConfigBodySchema,
  checkCcSellers,
  resolveRecipients,
  withAreaDefaults,
} from "@/server/areas/config";

/**
 * 029 — Configuración de áreas (`contracts/api-areas.md`).
 *
 * Fija el esquema del PUT, la regla de vendedores en copia y cómo se arman los
 * destinatarios del correo al enviar.
 */

const valido = {
  enabled: true,
  mailbox: "comercial@academia.test",
  ccEmails: ["gerencia@academia.test"],
  ccSellerIds: [],
  contactText: "Te va a contactar el equipo comercial.",
  officeHours: { days: [0, 1, 2, 3, 4], from: "09:00", to: "18:00" },
};

describe("areaConfigBodySchema (PUT)", () => {
  it("acepta una configuración completa", () => {
    expect(areaConfigBodySchema.safeParse(valido).success).toBe(true);
  });

  it("encendida sin casilla → inválida", () => {
    expect(areaConfigBodySchema.safeParse({ ...valido, mailbox: null }).success).toBe(false);
  });

  it("apagada sin casilla → válida", () => {
    expect(
      areaConfigBodySchema.safeParse({ ...valido, enabled: false, mailbox: null }).success
    ).toBe(true);
  });

  it("más de 10 copias → inválida", () => {
    const ccEmails = Array.from({ length: 11 }, (_, i) => `c${i}@x.test`);
    expect(areaConfigBodySchema.safeParse({ ...valido, ccEmails }).success).toBe(false);
  });

  it("una copia que no es correo → inválida", () => {
    expect(areaConfigBodySchema.safeParse({ ...valido, ccEmails: ["nope"] }).success).toBe(false);
  });

  it("horario con from >= to → inválido", () => {
    expect(
      areaConfigBodySchema.safeParse({
        ...valido,
        officeHours: { days: [0], from: "18:00", to: "09:00" },
      }).success
    ).toBe(false);
  });

  it("días 0..6 (0 = lunes); 7 → inválido", () => {
    expect(
      areaConfigBodySchema.safeParse({
        ...valido,
        officeHours: { days: [6], from: "09:00", to: "12:00" },
      }).success
    ).toBe(true);
    expect(
      areaConfigBodySchema.safeParse({
        ...valido,
        officeHours: { days: [7], from: "09:00", to: "12:00" },
      }).success
    ).toBe(false);
  });

  it("texto de contacto de más de 600 → inválido", () => {
    expect(
      areaConfigBodySchema.safeParse({ ...valido, contactText: "x".repeat(601) }).success
    ).toBe(false);
  });
});

describe("checkCcSellers", () => {
  const sellers = [
    { id: "sel_1", name: "Ana", email: "ana@x.test", archivedAt: null },
    { id: "sel_2", name: "Beto", email: null, archivedAt: new Date() },
  ];

  it("soporte con vendedores en copia → error", () => {
    expect(checkCcSellers("soporte", ["sel_1"], sellers)).toMatch(/Ventas/);
  });

  it("vendedor inexistente → error con su id", () => {
    expect(checkCcSellers("ventas", ["sel_x"], sellers)).toContain("sel_x");
  });

  it("vendedor archivado → error con su nombre", () => {
    expect(checkCcSellers("ventas", ["sel_2"], sellers)).toContain("Beto");
  });

  it("vendedor activo → sin error", () => {
    expect(checkCcSellers("ventas", ["sel_1"], sellers)).toBeNull();
  });
});

describe("withAreaDefaults", () => {
  it("devuelve SIEMPRE las dos áreas; la que falta, con valores por defecto", () => {
    const out = withAreaDefaults([
      {
        area: "ventas",
        enabled: true,
        mailbox: "comercial@x.test",
        ccEmails: [],
        ccSellerIds: [],
        contactText: null,
        officeHours: null,
        updatedAt: new Date("2026-10-08T10:00:00Z"),
      },
    ]);
    expect(out.map((a) => a.area)).toEqual(["ventas", "soporte"]);
    expect(out[0]?.updatedAt).toBe("2026-10-08T10:00:00.000Z");
    expect(out[1]).toEqual({
      area: "soporte",
      enabled: false,
      mailbox: null,
      ccEmails: [],
      ccSellerIds: [],
      contactText: null,
      officeHours: null,
      updatedAt: null,
    });
  });
});

describe("resolveRecipients", () => {
  const config = {
    mailbox: "comercial@x.test",
    ccEmails: ["gerencia@x.test", "Comercial@x.test", "gerencia@x.test"],
    ccSellerIds: ["sel_1", "sel_2", "sel_3", "sel_4"],
  };
  const sellers = [
    { id: "sel_1", name: "Ana", email: "ana@x.test", archivedAt: null },
    { id: "sel_2", name: "Beto", email: null, archivedAt: null },
    { id: "sel_3", name: "Caro", email: "caro@x.test", archivedAt: new Date() },
    { id: "sel_5", name: "Dani", email: "gerencia@x.test", archivedAt: null },
  ];

  it("To = casilla; CC = copias ∪ vendedores activos, sin duplicados ni el To", () => {
    const r = resolveRecipients(config, sellers);
    expect(r.to).toEqual(["comercial@x.test"]);
    expect(r.cc).toEqual(["gerencia@x.test", "ana@x.test"]);
  });

  it("vendedores sin correo, archivados o inexistentes van a omitted con motivo", () => {
    const r = resolveRecipients(config, sellers);
    expect(r.omitted).toEqual([
      { sellerId: "sel_2", reason: "sin_correo" },
      { sellerId: "sel_3", reason: "archivado" },
      { sellerId: "sel_4", reason: "inexistente" },
    ]);
  });
});
