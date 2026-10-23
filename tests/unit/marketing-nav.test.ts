import { describe, expect, it } from "vitest";
import { NAV_GROUPS, SETTINGS_TABS } from "@/lib/nav";
import { GUIA_CAPACIDADES } from "@/lib/guia";

/**
 * 045 (T008, research R9) — "Marketing" en el menú, su pestaña de Ajustes y su
 * lugar en la guía. Complementa `guia.test.ts`, que exige que todo ítem del
 * menú con capacidad esté descrito en la guía.
 */
describe("045 — navegación de Marketing", () => {
  const marketing = NAV_GROUPS.find((g) => g.label === "Marketing")!;

  // 2026-10-23 — La barra se agrupa por el equipo que la usa: «Marketing» abre
  // su propio grupo (antes colgaba de «CRM», detrás de «Empresas»).
  it("«Marketing» es el primer ítem del grupo Marketing", () => {
    const item = marketing.items[0];
    expect(item, "el grupo Marketing está vacío").toBeDefined();
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
