import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 031 (T027, DV-010) — Los guards ESTRUCTURALES de lo que ve el alumno.
 *
 * Mismo criterio que `student-portal.test.ts`: las reglas viven en la FORMA
 * del código y romperlas no hace fallar nada visible. Un filtro de estado
 * movido del WHERE al `.filter()` de JavaScript compila y responde 200 — y
 * ya consultó, armó y tuvo en memoria el borrador que el alumno no debe ver
 * (FR-024: "un dato que no se debe ver no viaja", tampoco a la memoria).
 *
 * El comportamiento lo conducen `correcciones.test.ts` y el arnés E2E (T043).
 */

const ROOT = process.cwd();
const MODULO = readFileSync(path.join(ROOT, "src", "server", "corrections.ts"), "utf8");
const RUTA = path.join(ROOT, "src", "app", "api", "portal", "me", "correcciones", "route.ts");

const sinComentarios = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const codigo = sinComentarios(MODULO);

/** Desde el tipo del alumno hasta el final: la sección que le sirve al portal. */
const seccionAlumno = (() => {
  const desde = codigo.indexOf("export type StudentCorrectionDto");
  return desde === -1 ? "" : codigo.slice(desde);
})();

describe("031 — lo que ve el alumno de una corrección", () => {
  it("el módulo no decide códigos de autorización: nunca 403", () => {
    expect(codigo).not.toMatch(/\b403\b/);
    expect(codigo).not.toMatch(/apiError\s*\(/);
  });

  it("existe la sección del alumno, al final del módulo", () => {
    expect(seccionAlumno).toContain("export type StudentCorrectionDto");
    expect(seccionAlumno).toContain("export async function correccionesPublicadasDeCursada(");
  });

  it("toda función exportada del alumno recibe el contacto como alcance", () => {
    const firmas = [...seccionAlumno.matchAll(/export async function (\w+)\(([^)]*)\)/g)];
    expect(firmas.length).toBeGreaterThan(0);
    for (const [, nombre, args] of firmas) {
      expect(args, `${nombre} no recibe contactId`).toContain("contactId");
    }
  });

  it("verifica que la inscripción sea de ESE contacto, en la consulta", () => {
    expect(seccionAlumno).toMatch(/eq\(schema\.enrollment\.contactId,\s*contactId\)/);
  });

  it("filtra `published` en el WHERE: el borrador ni se consulta", () => {
    expect(seccionAlumno).toMatch(/eq\(schema\.correction\.status,\s*"published"\)/);
    // Ni `inArray` de estados ni un filtro en memoria que lo deje pasar primero.
    expect(seccionAlumno).not.toMatch(/inArray\(schema\.correction\.status/);
    expect(seccionAlumno).not.toMatch(/\.filter\([^)]*status/);
  });

  it("el DTO del alumno no lleva el circuito de aprobación", () => {
    for (const campo of ["reviewComment", "submittedAt", "reviewedBy", "reviewedAt", "status:"]) {
      expect(seccionAlumno, `la sección del alumno nombra ${campo}`).not.toContain(campo);
    }
    // Y no reusa el armado del staff, que sí los trae.
    expect(seccionAlumno).not.toMatch(/\baDto\(/);
  });
});

describe("031 — la ruta del alumno", () => {
  it("existe y entra por la puerta del alumno, sin mezclar", () => {
    expect(existsSync(RUTA)).toBe(true);
    const src = readFileSync(RUTA, "utf8");
    expect(src).toContain("requireStudentPortal(");
    expect(src).not.toContain("requireTeacherPortal(");
    expect(src).not.toContain("requireCapability(");
  });

  it("solo lee: exporta GET y nada más", () => {
    const src = readFileSync(RUTA, "utf8");
    const verbos = [...src.matchAll(/export const (\w+)\s*=/g)].map((m) => m[1]);
    expect(verbos.filter((v) => v !== "dynamic")).toEqual(["GET"]);
  });
});

/* ============================================================
 * US4 (T033–T035, DV-012) — La bandeja de aprobación
 * ============================================================ */

describe("031 — la bandeja de aprobación", () => {
  const RUTAS = [
    ["src", "app", "api", "corrections", "route.ts"],
    ["src", "app", "api", "corrections", "[id]", "route.ts"],
    ["src", "app", "api", "corrections", "[id]", "approve", "route.ts"],
    ["src", "app", "api", "corrections", "[id]", "return", "route.ts"],
  ];

  it("toda ruta de la bandeja exige `correcciones.aprobar`, y nada más", () => {
    for (const r of RUTAS) {
      const file = path.join(ROOT, ...r);
      expect(existsSync(file), `falta ${r.join("/")}`).toBe(true);
      const src = readFileSync(file, "utf8");
      const verbos = [...src.matchAll(/export const (GET|POST|PUT|PATCH|DELETE)\s*=/g)];
      expect(verbos.length).toBeGreaterThan(0);
      const puertas = [...src.matchAll(/requireCapability\(\s*"([\w.]+)"/g)].map((m) => m[1]);
      expect(puertas).toEqual(verbos.map(() => "correcciones.aprobar"));
    }
  });

  it("la página existe y la barra lateral la ofrece solo con la capacidad", async () => {
    expect(existsSync(path.join(ROOT, "src", "app", "(app)", "correcciones", "page.tsx"))).toBe(true);
    const { NAV_GROUPS } = await import("@/lib/nav");
    const item = NAV_GROUPS.flatMap((g) => [...g.items]).find((i) => i.href === "/correcciones");
    expect(item?.capability).toBe("correcciones.aprobar");
  });

  it("la guía manda `correcciones.aprobar` a la bandeja", async () => {
    const { GUIA_CAPACIDADES } = await import("@/lib/guia");
    expect(GUIA_CAPACIDADES["correcciones.aprobar"].donde).toBe("/correcciones");
  });
});

/* ============================================================
 * DV-005/DV-013 — La planilla del PROFESOR no esquiva la corrección
 * ============================================================ */

describe("031 — la planilla del profesor", () => {
  const CLIENTE = readFileSync(
    path.join(ROOT, "src", "components", "portal", "portal-cohort-client.tsx"),
    "utf8"
  );
  const PORTAL = readFileSync(path.join(ROOT, "src", "server", "teacher-portal.ts"), "utf8");

  it("decide con `admiteAtajo` qué celda es atajo y cuál abre la corrección", () => {
    expect(CLIENTE).toMatch(/admiteAtajo\(plantillaDe\(/);
    expect(CLIENTE).toContain("<CorrectionPanel");
  });

  it("la corrección del profesor entra por SU puerta, no por la del staff", () => {
    expect(CLIENTE).toMatch(/endpoint=\{`\/api\/portal\/assessments\/\$\{/);
    expect(CLIENTE).not.toMatch(/`\/api\/assessments\/\$\{[^`]*\/corrections/);
  });

  it("la planilla del profesor trae la nota publicada para mostrarla en la celda", () => {
    expect(PORTAL).toMatch(/scores:\s*s\.scores/);
  });
});
