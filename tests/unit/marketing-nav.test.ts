import { describe, expect, it } from "vitest";
import { NAV_GROUPS, SETTINGS_TABS } from "@/lib/nav";
import { GUIA_CAPACIDADES } from "@/lib/guia";

/**
 * 045 (T008, research R9) — "Marketing" en el menú, su pestaña de Ajustes y su
 * lugar en la guía. Complementa `guia.test.ts`, que exige que todo ítem del
 * menú con capacidad esté descrito en la guía.
 */
describe("045 — navegación de Marketing", () => {
  const crm = NAV_GROUPS.find((g) => g.label === "CRM")!;

  it("«Marketing» está en el grupo CRM, justo después de «Empresas»", () => {
    const labels = crm.items.map((i) => i.label as string);
    const iEmpresas = labels.indexOf("Empresas");
    expect(iEmpresas).toBeGreaterThanOrEqual(0);
    const item = crm.items[iEmpresas + 1];
    expect(item, "no hay nada después de Empresas").toBeDefined();
    expect({ href: item!.href, label: item!.label, capability: item!.capability }).toEqual({
      href: "/marketing",
      label: "Marketing",
      capability: "marketing.ver",
    });
  });

  it("la pestaña de Ajustes exige `marketing.configurar`", () => {
    const tab = SETTINGS_TABS.find((t) => t.href === "/settings/marketing");
    expect(tab).toEqual({
      href: "/settings/marketing",
      label: "Marketing",
      capability: "marketing.configurar",
    });
  });

  it("la guía manda cada capacidad a su pantalla", () => {
    expect(GUIA_CAPACIDADES["marketing.ver"].donde).toBe("/marketing");
    expect(GUIA_CAPACIDADES["marketing.enviar"].donde).toBe("/marketing");
    expect(GUIA_CAPACIDADES["marketing.configurar"].donde).toBe("/settings/marketing");
  });
});
