import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-21 — La pestaña Alumnos de un MÓDULO muestra el correo de la
 * licencia, con la misma regla que el roster del grupo y la vista de
 * Licencias: viaja solo para quien ve correos (`contactos.ver`). La ficha
 * del módulo se abre con `academico.ver`, que no alcanza para ver correos.
 * La lectura del módulo sigue sin nombrar columnas de contacto (FR-017): el
 * correo lo suma la ruta.
 */
const ruta = readFileSync("src/app/api/cohorts/[id]/module-roster/route.ts", "utf8");
const servidor = readFileSync("src/server/module-roster.ts", "utf8");

describe("correo de la licencia en el roster del módulo", () => {
  it("la ruta lo consulta solo con contactos.ver", () => {
    const corte = ruta.indexOf('includes("contactos.ver")');
    const consulta = ruta.indexOf("await correosDeLicenciaPorInscripcion(");
    expect(corte).toBeGreaterThan(-1);
    expect(consulta).toBeGreaterThan(corte);
  });

  it("module-roster.ts no consulta el correo", () => {
    expect(servidor).not.toMatch(/licenseEmail|contact\.email/);
  });
});
