import { describe, expect, it } from "vitest";
import { FORM_ARRIVAL_WINDOW_MS, esLlegadaReciente } from "@/lib/form-arrivals";

/**
 * El número de "Alumnos" en el menú cuenta los contactos que llegaron por un
 * formulario en las últimas 48 h; la tabla resalta a ESOS mismos. Una sola
 * regla para los dos, o el número y el resaltado dirían cosas distintas.
 */
describe("esLlegadaReciente", () => {
  const ahora = new Date("2026-10-21T12:00:00Z");
  const hace = (horas: number) => new Date(ahora.getTime() - horas * 3_600_000).toISOString();

  it("un formulario de hace menos de 48 h se resalta", () => {
    expect(esLlegadaReciente({ source: "formulario:Revit", createdAt: hace(1) }, ahora)).toBe(true);
    expect(esLlegadaReciente({ source: "formulario:Taller BIM", createdAt: hace(47.9) }, ahora)).toBe(true);
  });

  it("pasadas las 48 h deja de resaltarse", () => {
    expect(esLlegadaReciente({ source: "formulario:Revit", createdAt: hace(48.1) }, ahora)).toBe(false);
  });

  it("lo que no vino por formulario no se resalta, aunque sea nuevo", () => {
    expect(esLlegadaReciente({ source: "whatsapp", createdAt: hace(1) }, ahora)).toBe(false);
    expect(esLlegadaReciente({ source: null, createdAt: hace(1) }, ahora)).toBe(false);
  });

  it("la ventana es de 48 horas", () => {
    expect(FORM_ARRIVAL_WINDOW_MS).toBe(48 * 60 * 60 * 1000);
  });
});
