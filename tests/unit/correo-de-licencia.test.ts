import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { correoDeLicencia } from "@/lib/license-email";

/**
 * Correo para la licencia (2026-10-21) — `enrollment.license_email`: la
 * licencia de una inscripción puede ir a otro correo que el del alumno (el de
 * su empresa, por ejemplo). Todo lo que muestra o exporta "el correo de la
 * licencia" pasa por UN helper: `license_email ?? contact.email`.
 */

describe("correoDeLicencia", () => {
  it("sin correo propio de licencia, es el del alumno y no se marca", () => {
    expect(correoDeLicencia({ licenseEmail: null, contactEmail: "ana@mail.com" })).toEqual({
      email: "ana@mail.com",
      distinto: false,
    });
  });

  it("con correo propio distinto, gana y se marca", () => {
    expect(
      correoDeLicencia({ licenseEmail: "ana@empresa.uy", contactEmail: "ana@mail.com" })
    ).toEqual({ email: "ana@empresa.uy", distinto: true });
  });

  it("igual al del alumno (sin importar mayúsculas): no se marca", () => {
    expect(
      correoDeLicencia({ licenseEmail: "ana@mail.com", contactEmail: "Ana@Mail.com" })
    ).toEqual({ email: "ana@mail.com", distinto: false });
  });

  it("alumno sin correo y licencia con correo: se marca (es otro dato)", () => {
    expect(correoDeLicencia({ licenseEmail: "x@empresa.uy", contactEmail: null })).toEqual({
      email: "x@empresa.uy",
      distinto: true,
    });
  });

  it("sin ninguno: null", () => {
    expect(correoDeLicencia({ licenseEmail: null, contactEmail: null })).toEqual({
      email: null,
      distinto: false,
    });
  });

  it("la hija de un módulo hereda el de la madre si no tiene propio", () => {
    expect(
      correoDeLicencia({
        licenseEmail: null,
        parentLicenseEmail: "ana@empresa.uy",
        contactEmail: "ana@mail.com",
      })
    ).toEqual({ email: "ana@empresa.uy", distinto: true });
  });
});

describe("migración de license_email y correos en minúsculas", () => {
  const dir = path.resolve(__dirname, "../../drizzle");
  const archivo = readdirSync(dir).find((f) => /^\d{4}_correo_de_licencia/.test(f));

  it("existe y es re-ejecutable", () => {
    expect(archivo).toBeDefined();
    const sql = readFileSync(path.join(dir, archivo!), "utf8").toLowerCase();
    expect(sql).toMatch(/add column if not exists "license_email" text/);
  });

  it("pasar correos a minúsculas no choca con duplicados que solo difieren en mayúsculas", () => {
    const sql = readFileSync(path.join(dir, archivo!), "utf8").toLowerCase();
    // El UPDATE se salta a quien tiene un "gemelo" por mayúsculas: no fusiona
    // ni rompe el índice único.
    expect(sql).toMatch(/update "contact"[\s\S]*not exists/);
    // El índice por lower(email) solo se crea si no hay gemelos.
    expect(sql).toMatch(/if not exists \([\s\S]*having count\(\*\) > 1[\s\S]*\) then/);
  });
});

describe("quién ve el correo de la licencia", () => {
  const leer = (p: string) => readFileSync(path.resolve(__dirname, "../..", p), "utf8");

  it("la vista de Licencias lo pide solo con contactos.ver", () => {
    const ruta = leer("src/app/api/licenses/route.ts");
    expect(ruta).toMatch(/includes\("contactos\.ver"\)/);
    expect(ruta).toMatch(/vistaDeLicencias\(session\.organizationId, \{ conCorreo \}\)/);
  });

  it("editarlo exige academico.editar, como asignar una licencia", () => {
    const ruta = leer("src/app/api/enrollments/[id]/license-email/route.ts");
    expect(ruta).toMatch(/requireCapability\(\s*"academico\.editar"/);
  });

  it.each([
    "src/server/enrollments.ts",
    "src/server/license-view.ts",
    "src/server/licenses.ts",
  ])("%s lo resuelve con correoDeLicencia (un solo helper)", (archivo) => {
    expect(leer(archivo)).toContain("correoDeLicencia(");
  });
});
