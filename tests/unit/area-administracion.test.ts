import { describe, expect, it } from "vitest";
import { AREAS, CONFIG_AREAS, CONFIG_AREA_LABELS, isArea, isConfigArea } from "@/lib/areas";
import { checkCcSellers, withAreaDefaults } from "@/server/areas/config";
import { AgentAction } from "@/server/ai/actions";

/**
 * 039 — El área Administración existe para los AVISOS INTERNOS (facturación
 * pendiente), no para el agente: el asistente de WhatsApp no le puede derivar
 * consultas de clientes. Las dos listas son distintas a propósito.
 */

const fila = (area: "ventas" | "soporte" | "administracion") => ({
  area,
  enabled: true,
  mailbox: `${area}@academia.test`,
  ccEmails: [],
  ccSellerIds: [],
  contactText: null,
  officeHours: null,
  updatedAt: new Date("2026-10-19T10:00:00Z"),
});

describe("039 — área Administración", () => {
  it("es un área configurable, pero NO un área de derivación", () => {
    expect(CONFIG_AREAS).toEqual(["ventas", "soporte", "administracion", "interesados"]);
    expect(AREAS).toEqual(["ventas", "soporte"]);
    expect(isConfigArea("administracion")).toBe(true);
    expect(isArea("administracion")).toBe(false);
    expect(CONFIG_AREA_LABELS.administracion).toBe("Administración");
  });

  it("lo que ve el agente (derivación) sigue siendo Ventas y Soporte, aunque haya fila de Administración", () => {
    const out = withAreaDefaults([fila("ventas"), fila("administracion")]);
    expect(out.map((a) => a.area)).toEqual(["ventas", "soporte"]);
  });

  it("la pantalla de configuración las ve todas", () => {
    const out = withAreaDefaults([fila("administracion")], CONFIG_AREAS);
    expect(out.map((a) => a.area)).toEqual(["ventas", "soporte", "administracion", "interesados"]);
    expect(out[2]?.mailbox).toBe("administracion@academia.test");
  });

  it("el modelo no puede derivar a Administración", () => {
    const r = AgentAction.safeParse({
      action: "derive_area",
      topic: "ventas",
      area: "administracion",
      summary: "factura",
    });
    expect(r.success).toBe(false);
  });

  it("solo Ventas lleva vendedores en copia", () => {
    expect(
      checkCcSellers("administracion", ["sel_1"], [
        { id: "sel_1", name: "Ana", email: "ana@x.test", archivedAt: null },
      ])
    ).toContain("Solo Ventas");
  });
});
