import { describe, expect, it } from "vitest";
import type { AreaConfigDto, ConfigArea } from "@/lib/areas";
import {
  AREA_HELP,
  atiendeClientes,
  buildAreaBody,
  formFromDto,
  llevaVendedores,
  splitEmails,
  type AreaForm,
} from "@/lib/area-config-form";
import { areaConfigBodySchema } from "@/server/areas/config";
import { SETTINGS_TABS, primerDestinoDeSettings } from "@/lib/nav";

const vacia = (area: ConfigArea): AreaConfigDto<ConfigArea> => ({
  area,
  enabled: false,
  mailbox: null,
  ccEmails: [],
  ccSellerIds: [],
  contactText: null,
  officeHours: null,
  updatedAt: null,
});

const form = (area: ConfigArea, partial: Partial<AreaForm> = {}): AreaForm => ({
  ...formFromDto(vacia(area)),
  ...partial,
});

describe("Configuración › Áreas — formulario", () => {
  it("una fila por defecto se vuelve un formulario vacío con horario sugerido apagado", () => {
    const f = formFromDto(vacia("soporte"));
    expect(f).toMatchObject({ enabled: false, mailbox: "", ccEmails: "", hoursEnabled: false });
    expect(f.days).toEqual([0, 1, 2, 3, 4]);
  });

  it("ida y vuelta: lo guardado vuelve a armar el mismo cuerpo", () => {
    const dto: AreaConfigDto<ConfigArea> = {
      area: "ventas",
      enabled: true,
      mailbox: "ventas@academia.com",
      ccEmails: ["a@academia.com", "b@academia.com"],
      ccSellerIds: ["sl_1"],
      contactText: "Te escribe el equipo comercial.",
      officeHours: { days: [0, 2], from: "09:00", to: "17:00" },
      updatedAt: "2026-10-19T12:00:00.000Z",
    };
    const built = buildAreaBody("ventas", formFromDto(dto), ["sl_1"]);
    expect(built).toEqual({
      ok: true,
      body: {
        enabled: true,
        mailbox: "ventas@academia.com",
        ccEmails: ["a@academia.com", "b@academia.com"],
        ccSellerIds: ["sl_1"],
        contactText: "Te escribe el equipo comercial.",
        officeHours: { days: [0, 2], from: "09:00", to: "17:00" },
      },
    });
  });

  it("parte las copias por coma, punto y coma o renglón, sin repetidos", () => {
    expect(splitEmails(" a@x.com, b@x.com;\nA@X.com  c@x.com ,, ")).toEqual([
      "a@x.com",
      "b@x.com",
      "c@x.com",
    ]);
  });

  it("marca la casilla y las copias inválidas con un mensaje que nombra el correo", () => {
    const r = buildAreaBody("soporte", form("soporte", { mailbox: "soporte@", ccEmails: "ok@x.com, mal" }), []);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.mailbox).toContain("soporte@");
    expect(r.errors.ccEmails).toContain("mal");
  });

  it("encender sin casilla no se puede (misma regla que el servidor)", () => {
    const r = buildAreaBody("soporte", form("soporte", { enabled: true }), []);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.mailbox).toMatch(/casilla/);
  });

  it("más de 10 copias se rechaza antes de llegar a la API", () => {
    const muchas = Array.from({ length: 11 }, (_, i) => `p${i}@x.com`).join(",");
    const r = buildAreaBody("soporte", form("soporte", { ccEmails: muchas }), []);
    expect(r.ok).toBe(false);
  });

  it("un vendedor elegido que ya no está activo bloquea el guardado", () => {
    const r = buildAreaBody("ventas", form("ventas", { ccSellerIds: ["sl_viejo"] }), ["sl_1"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.ccSellerIds).toBeDefined();
  });

  it("solo Ventas lleva vendedores: en otra área se mandan vacíos", () => {
    const r = buildAreaBody("soporte", form("soporte", { ccSellerIds: ["sl_1"] }), ["sl_1"]);
    expect(r.ok && r.body.ccSellerIds).toEqual([]);
    expect(llevaVendedores("ventas")).toBe(true);
    expect(llevaVendedores("administracion")).toBe(false);
  });

  it("el horario exige días y que empiece antes de terminar", () => {
    const sinDias = buildAreaBody("ventas", form("ventas", { hoursEnabled: true, days: [] }), []);
    expect(sinDias.ok).toBe(false);
    const alReves = buildAreaBody(
      "ventas",
      form("ventas", { hoursEnabled: true, from: "18:00", to: "09:00" }),
      []
    );
    expect(alReves.ok).toBe(false);
    const ok = buildAreaBody("ventas", form("ventas", { hoursEnabled: true, days: [4, 0, 4] }), []);
    expect(ok.ok && ok.body.officeHours).toEqual({ days: [0, 4], from: "09:00", to: "18:00" });
  });

  it("Administración no atiende clientes: sin texto de contacto ni horario", () => {
    expect(atiendeClientes("administracion")).toBe(false);
    expect(atiendeClientes("ventas")).toBe(true);
    const r = buildAreaBody(
      "administracion",
      form("administracion", {
        enabled: true,
        mailbox: "admin@academia.com",
        contactText: "no aplica",
        hoursEnabled: true,
      }),
      []
    );
    expect(r.ok && r.body).toMatchObject({ contactText: null, officeHours: null });
  });

  it("cada área dice qué le llega", () => {
    expect(AREA_HELP.soporte).toMatch(/cohorte confirmada/);
    expect(AREA_HELP.administracion).toMatch(/facturación/);
    // 041 — Lo que le llega a Administración desde los avisos de cobranza.
    expect(AREA_HELP.administracion).toMatch(/inscripción nueva/);
    expect(AREA_HELP.administracion).toMatch(/vendedor/);
    expect(AREA_HELP.administracion).toMatch(/pago registrado/);
    expect(AREA_HELP.administracion).toMatch(/morosidad/);
  });

  it("todo cuerpo que arma la pantalla lo acepta el esquema del servidor", () => {
    const casos: [ConfigArea, Partial<AreaForm>][] = [
      ["ventas", { enabled: true, mailbox: "v@x.com", ccEmails: "a@x.com", ccSellerIds: ["sl_1"], hoursEnabled: true }],
      ["soporte", { enabled: false, contactText: "  hola  " }],
      ["administracion", { enabled: true, mailbox: "adm@x.com" }],
    ];
    for (const [area, partial] of casos) {
      const r = buildAreaBody(area, form(area, partial), ["sl_1"]);
      expect(r.ok, area).toBe(true);
      if (r.ok) expect(areaConfigBodySchema.safeParse(r.body).success, area).toBe(true);
    }
  });
});

describe("Configuración › Áreas — pestaña", () => {
  it("la pestaña existe con `areas.configurar` y solo esa capacidad la abre", () => {
    expect(SETTINGS_TABS.find((t) => t.href === "/settings/areas")?.capability).toBe(
      "areas.configurar"
    );
    expect(primerDestinoDeSettings(["areas.configurar"])).toBe("/settings/areas");
  });
});
