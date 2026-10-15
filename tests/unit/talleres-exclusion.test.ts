import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 033 (FR-021, SC-006) — Ningún inscripto a taller aparece como alumno.
 *
 * Un taller es una cohorte y su gente son inscripciones: cualquier lectura de
 * "qué cursa esta persona" los vería sin un filtro explícito. Este guard es
 * estructural: cada superficie listada tiene que nombrar uno de los dos
 * filtros de `src/server/workshop-scope.ts`. Una consulta nueva que se olvide
 * no la ve el typecheck; la ve este test.
 */

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const SUPERFICIES: Record<string, string> = {
  "src/server/student-record.ts": "el legajo",
  "src/server/transcript.ts": "la escolaridad",
  "src/server/student-portal.ts": "el portal del alumno",
  "src/server/teacher-portal.ts": "el portal del profesor",
  "src/server/company-report.ts": "el reporte por empresa",
  "src/server/dashboard.ts": "el contador de alumnos",
  "src/server/student-header.ts": "el encabezado del alumno",
  "src/server/access.ts": "el acceso al portal (¿se inscribió alguna vez?)",
  "src/app/api/pipeline/board/route.ts": "el tablero de ventas",
};

describe("033 (FR-021) — los talleres no se mezclan con las cursadas", () => {
  for (const [archivo, que] of Object.entries(SUPERFICIES)) {
    it(`${que} (${archivo}) excluye las inscripciones a talleres`, () => {
      const src = leer(archivo);
      expect(src).toMatch(/from "@\/server\/workshop-scope"/);
      expect(src).toMatch(/\b(cursoNoEsTaller|cohorteNoEsDeTaller)\(/);
    });
  }

  it("el portal del profesor filtra su alcance en las dos consultas (titular y suplencia)", () => {
    const src = leer("src/server/teacher-portal.ts");
    const alcance = src.slice(
      src.indexOf("export async function resolveTeacherScope"),
      src.indexOf("export async function teacherReachesCohort")
    );
    expect(alcance.match(/cohorteNoEsDeTaller\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    const alcanza = src.slice(
      src.indexOf("export async function teacherReachesCohort"),
      src.indexOf("/* ============================================================\n * Lo que ve")
    );
    expect(alcanza).toMatch(/cohorteNoEsDeTaller\(/);
  });

  it("el portal del alumno filtra sus cursadas y su menú", () => {
    const src = leer("src/server/student-portal.ts");
    for (const fn of ["async function scopedEnrollments", "export async function studentNavCourses"]) {
      const desde = src.indexOf(fn);
      expect(desde, fn).toBeGreaterThan(-1);
      const cuerpo = src.slice(desde, desde + 2500);
      expect(cuerpo, fn).toMatch(/cursoNoEsTaller\(/);
    }
  });

  it("Cobranza y Finanzas NO filtran: el taller cobrado tiene que aparecer (FR-016)", () => {
    for (const archivo of ["src/server/billing.ts", "src/server/finanzas-periodo.ts"]) {
      expect(leer(archivo), archivo).not.toMatch(/workshop-scope/);
    }
  });
});
