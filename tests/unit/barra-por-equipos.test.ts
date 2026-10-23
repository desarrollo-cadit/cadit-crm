import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/lib/nav";

/**
 * 2026-10-23 — La barra del staff se agrupa por el EQUIPO que usa cada
 * pantalla (los mismos de los roles y las áreas), no en un "Gestión" que
 * mezclaba nueve cosas de cuatro equipos. Un grupo sin nada que la sesión
 * pueda ver no se dibuja (`app-nav.tsx`).
 */
describe("la barra lateral por equipos", () => {
  it("grupos y entradas, en orden", () => {
    expect(
      NAV_GROUPS.map((g) => ({ grupo: g.label, items: g.items.map((i) => i.label as string) }))
    ).toEqual([
      { grupo: "Inicio", items: ["Dashboard"] },
      { grupo: "Comercial", items: ["Bandeja", "Pipeline", "Contactos", "Empresas"] },
      { grupo: "Marketing", items: ["Marketing", "Talleres"] },
      { grupo: "Académico", items: ["Académico", "Calendario", "Correcciones", "Cursos offline"] },
      { grupo: "Soporte", items: ["Licencias", "Grabaciones"] },
      { grupo: "Administración", items: ["Finanzas", "Facturación"] },
    ]);
  });
});
