import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AREAS, CONFIG_AREAS, CONFIG_AREA_LABELS, isArea, isConfigArea } from "@/lib/areas";
import { AREA_HELP, atiendeClientes, buildAreaBody, formFromDto, llevaVendedores } from "@/lib/area-config-form";
import { areaConfigBodySchema, checkCcSellers, withAreaDefaults } from "@/server/areas/config";
import { AgentAction } from "@/server/ai/actions";

/**
 * Área "Nuevos interesados": a quién le llega el aviso de cada persona que
 * deja sus datos en un formulario público. Se configura aparte de Ventas
 * (puede variar a quién se avisa) y, como Administración, el agente de
 * WhatsApp NO le deriva consultas.
 */

const sellers = [
  { id: "sel_1", name: "Ana", email: "ana@x.test", archivedAt: null },
  { id: "sel_2", name: "Beto", email: "beto@x.test", archivedAt: new Date() },
];

describe("área Nuevos interesados", () => {
  it("es configurable, pero no es un área de derivación del agente", () => {
    expect(CONFIG_AREAS).toContain("interesados");
    expect(AREAS).not.toContain("interesados");
    expect(isConfigArea("interesados")).toBe(true);
    expect(isArea("interesados")).toBe(false);
    expect(CONFIG_AREA_LABELS.interesados).toBe("Nuevos interesados");
  });

  it("el modelo no puede derivarle consultas", () => {
    const r = AgentAction.safeParse({
      action: "derive_area",
      topic: "ventas",
      area: "interesados",
      summary: "quiere info",
    });
    expect(r.success).toBe(false);
  });

  it("lo que ve el agente no la incluye aunque tenga fila", () => {
    const fila = {
      area: "interesados" as const,
      enabled: true,
      mailbox: "leads@x.test",
      ccEmails: [],
      ccSellerIds: [],
      contactText: null,
      officeHours: null,
      updatedAt: null,
    };
    expect(withAreaDefaults([fila]).map((a) => a.area)).toEqual(["ventas", "soporte"]);
  });

  it("puede llevar vendedores en copia (activos)", () => {
    expect(llevaVendedores("interesados")).toBe(true);
    expect(checkCcSellers("interesados", ["sel_1"], sellers)).toBeNull();
    expect(checkCcSellers("interesados", ["sel_2"], sellers)).toContain("Beto");
    expect(checkCcSellers("administracion", ["sel_1"], sellers)).toMatch(/Ventas/);
  });

  it("no atiende clientes: sin texto de contacto ni horario; el cuerpo lo acepta el servidor", () => {
    expect(atiendeClientes("interesados")).toBe(false);
    const form = {
      ...formFromDto({
        area: "interesados",
        enabled: false,
        mailbox: null,
        ccEmails: [],
        ccSellerIds: [],
        contactText: null,
        officeHours: null,
        updatedAt: null,
      }),
      enabled: true,
      mailbox: "leads@academia.com",
      contactText: "no aplica",
      hoursEnabled: true,
      ccSellerIds: ["sel_1"],
    };
    const r = buildAreaBody("interesados", form, ["sel_1"]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body).toMatchObject({ contactText: null, officeHours: null, ccSellerIds: ["sel_1"] });
      expect(areaConfigBodySchema.safeParse(r.body).success).toBe(true);
    }
  });

  it("la ayuda dice qué le llega", () => {
    expect(AREA_HELP.interesados).toMatch(/formulario/);
    expect(AREA_HELP.interesados).toMatch(/taller/);
  });

  it("la base acepta el área y sus vendedores (CHECK del esquema)", () => {
    const schema = readFileSync("src/lib/db/schema.ts", "utf8");
    expect(schema).toMatch(/area_config_area_valid[^\n]*'interesados'/);
    const migracion = readFileSync("drizzle/0065_avisos_de_interesados.sql", "utf8");
    expect(migracion).toMatch(/'interesados'/);
    expect(migracion).toMatch(/interesado_nuevo/);
  });
});
