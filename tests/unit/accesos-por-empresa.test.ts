import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { esExtension, resumenDeCursosDeEmpresa } from "@/lib/offline-grants";

/**
 * 045 — Cursos offline desde la empresa (`/empresas`): el resumen por curso
 * de los accesos directos de su gente, y la regla de "extender" de a una.
 */

const acceso = (
  contactId: string,
  courseId: string,
  hasta: string,
  vencido = false,
  courseTitle = `Curso ${courseId}`
) => ({ contactId, courseId, courseTitle, hasta, vencido });

describe("045 — resumen por curso de los accesos de una empresa", () => {
  it("sin accesos no hay cursos", () => {
    expect(resumenDeCursosDeEmpresa([])).toEqual([]);
  });

  it("cuenta personas y da la primera y la última fecha de cada curso", () => {
    const r = resumenDeCursosDeEmpresa([
      acceso("c1", "A", "2026-12-01"),
      acceso("c2", "A", "2027-03-15"),
      acceso("c3", "A", "2026-11-20"),
      acceso("c1", "B", "2027-01-01"),
    ]);
    expect(r).toEqual([
      { courseId: "A", courseTitle: "Curso A", personas: 3, primeraHasta: "2026-11-20", ultimaHasta: "2027-03-15" },
      { courseId: "B", courseTitle: "Curso B", personas: 1, primeraHasta: "2027-01-01", ultimaHasta: "2027-01-01" },
    ]);
  });

  it("lo vencido no cuenta como 'tienen hoy'", () => {
    const r = resumenDeCursosDeEmpresa([acceso("c1", "A", "2026-09-01", true), acceso("c2", "A", "2026-12-01")]);
    expect(r).toEqual([
      { courseId: "A", courseTitle: "Curso A", personas: 1, primeraHasta: "2026-12-01", ultimaHasta: "2026-12-01" },
    ]);
  });

  it("un curso con todos sus accesos vencidos no aparece", () => {
    expect(resumenDeCursosDeEmpresa([acceso("c1", "A", "2026-09-01", true)])).toEqual([]);
  });

  it("una persona cuenta una vez aunque aparezca repetida", () => {
    const r = resumenDeCursosDeEmpresa([acceso("c1", "A", "2026-12-01"), acceso("c1", "A", "2027-01-01")]);
    expect(r[0]?.personas).toBe(1);
  });

  it("ordena por título, en castellano", () => {
    const r = resumenDeCursosDeEmpresa([
      acceso("c1", "z", "2026-12-01", false, "Óptica"),
      acceso("c1", "y", "2026-12-01", false, "AutoCAD"),
      acceso("c1", "x", "2026-12-01", false, "Revit"),
    ]);
    expect(r.map((c) => c.courseTitle)).toEqual(["AutoCAD", "Óptica", "Revit"]);
  });
});

describe("045 — extender de a una persona nunca acorta", () => {
  it("una fecha posterior es extensión", () => {
    expect(esExtension("2026-12-01", "2026-12-02")).toBe(true);
  });
  it("la misma fecha no lo es", () => {
    expect(esExtension("2026-12-01", "2026-12-01")).toBe(false);
  });
  it("una fecha anterior no lo es", () => {
    expect(esExtension("2026-12-01", "2026-11-30")).toBe(false);
  });
  it("una fecha inválida no lo es", () => {
    expect(esExtension("2026-12-01", "2027-02-30")).toBe(false);
    expect(esExtension("2026-12-01", "")).toBe(false);
  });
});

describe("045 — lo que viaja a /empresas", () => {
  const src = readFileSync(path.join(process.cwd(), "src/server/offline-courses/grants.ts"), "utf8");
  const bloque = src.slice(src.indexOf("export async function companyOfflineGrants"));
  const cuerpo = bloque.slice(0, bloque.indexOf("\n}\n"));

  it("existe la lectura por empresa", () => {
    expect(src).toContain("export async function companyOfflineGrants");
    expect(cuerpo).toContain("offlineCourseGrant");
  });

  it("no lee datos de contacto ni la nota ni quién lo dio (Ventas solo ve nombres, cursos y fechas)", () => {
    for (const campo of ["email", "phone", "note", "createdBy", "user."]) {
      expect(cuerpo, campo).not.toContain(campo);
    }
  });

  it("la ruta de lectura es de `contactos.ver`, y asignar sigue siendo de `academico.editar`", () => {
    const ruta = readFileSync(
      path.join(process.cwd(), "src/app/api/companies/[id]/offline-grants/route.ts"),
      "utf8"
    );
    expect(ruta).toContain('requireCapability("contactos.ver"');
    expect(ruta).not.toMatch(/export const (POST|PATCH|PUT|DELETE)/);
  });
});
