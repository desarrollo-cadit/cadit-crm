import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 035 (US2, FR-008/FR-009) — Lo grupal bloquea lo individual en TODA ruta.
 *
 * La regla es pura y tiene su test (`licencias-grupales`, `cursos-offline-
 * grupo`). Lo que este guard cuida es que nadie abra una SEGUNDA puerta: una
 * ruta nueva que escriba `license` u `offline_course_access` por su cuenta
 * se saltearía el bloqueo sin que ningún test de la regla se entere.
 */

const ROOT = process.cwd();
const leer = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");

function archivos(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...archivos(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const rel = (f: string) => path.relative(ROOT, f).replace(/\\/g, "/");
const SRC = archivos(path.join(ROOT, "src"));

/** El cuerpo de una función exportada, hasta la siguiente declaración de nivel superior. */
function cuerpo(src: string, nombre: string): string {
  const desde = src.indexOf(`export async function ${nombre}(`);
  expect(desde, `no encontré ${nombre}`).toBeGreaterThan(-1);
  const resto = src.slice(desde + 1);
  const hasta = resto.search(/\n(export |async function |function |\/\*\*)/);
  return hasta === -1 ? resto : resto.slice(0, hasta);
}

describe("licencias (FR-008)", () => {
  const licenses = leer("src", "server", "licenses.ts");

  it("asignar por alumno pregunta por el grupo antes de escribir", () => {
    const asignar = cuerpo(licenses, "assignLicense");
    expect(asignar).toContain("bloqueoPorGrupo(");
    expect(asignar.indexOf("bloqueoPorGrupo(")).toBeLessThan(asignar.indexOf(".insert("));
    expect(asignar).toContain('"asignado_al_grupo"');
  });

  it("liberar por alumno pregunta por el grupo y sólo toca individuales", () => {
    const liberar = cuerpo(licenses, "unassignLicense");
    expect(liberar).toContain("bloqueoPorGrupo(");
    expect(liberar).toContain('eq(schema.license.source, "individual")');
  });

  it("la ruta individual usa esas dos funciones y devuelve su error", () => {
    const ruta = leer("src", "app", "api", "enrollments", "[id]", "license", "route.ts");
    expect(ruta).toContain("assignLicense(");
    expect(ruta).toContain("unassignLicense(");
    expect(ruta.match(/apiError\(result\.status/g)?.length).toBe(2);
  });

  it("nadie más escribe `license`: sólo licenses.ts y group-licenses.ts", () => {
    const permitidos = new Set(["src/server/licenses.ts", "src/server/group-licenses.ts"]);
    const escriben = SRC.filter((f) =>
      /\.(insert|update|delete)\(schema\.license\)/.test(readFileSync(f, "utf8"))
    ).map(rel);
    expect(escriben.filter((f) => !permitidos.has(f))).toEqual([]);
  });
});

describe("cursos offline (FR-009)", () => {
  const access = leer("src", "server", "offline-courses", "access.ts");

  it("el override individual pregunta por el grupo antes de escribir", () => {
    const override = cuerpo(access, "setEnrollmentOverride");
    expect(override).toContain("overrideIndividualPermitido(");
    expect(override.indexOf("overrideIndividualPermitido(")).toBeLessThan(
      override.indexOf("db.insert(")
    );
  });

  it("la ruta individual pasa por setEnrollmentOverride", () => {
    const ruta = leer("src", "app", "api", "enrollments", "[id]", "offline-courses", "route.ts");
    expect(ruta).toContain("setEnrollmentOverride(");
  });

  it("nadie más escribe `offline_course_access`", () => {
    const escriben = SRC.filter((f) =>
      /\.(insert|update|delete)\((schema\.)?offlineCourseAccess\)/.test(readFileSync(f, "utf8"))
    ).map(rel);
    expect(escriben).toEqual(["src/server/offline-courses/access.ts"]);
  });

  it("la migración 0058 borra otorgamientos redundantes y NO toca las quitas", () => {
    const sql = leer("drizzle", "0058_accesos_grupales.sql");
    expect(sql).toMatch(/delete from "offline_course_access"[\s\S]*"mode" = 'grant'/);
    expect(sql).not.toMatch(/"mode"\s*=\s*'revoke'/);
  });
});
