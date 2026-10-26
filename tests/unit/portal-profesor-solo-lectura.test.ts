import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 2026-10-26 — Pasar lista y cargar grabaciones son de Coordinación.
 *
 * El portal del profesor las VE (quién vino a cada clase, la grabación para
 * mirarla) pero no las escribe. La escritura vive solo del lado del staff:
 * `/api/cohorts/[id]/attendance`, `PATCH /api/class-sessions/[id]/links` y la
 * adjudicación de Zoom. Estos guards fijan que no vuelva a aparecer una
 * puerta de escritura en el portal, ni en la ruta ni en la pantalla.
 */

const ROOT = process.cwd();
const CLASES_API = path.join(ROOT, "src", "app", "api", "portal", "classes");
const leer = (...p: string[]) => readFileSync(path.join(ROOT, ...p), "utf8");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/route\.ts$/.test(e)) out.push(full);
  }
  return out;
}

describe("portal del profesor — asistencia y grabaciones en solo lectura", () => {
  it("la ruta de asistencia del portal solo expone GET", () => {
    const src = leer("src", "app", "api", "portal", "classes", "[id]", "attendance", "route.ts");
    expect(src).toMatch(/export const GET\b/);
    expect(src).not.toMatch(/export (const|async function) (POST|PUT|PATCH|DELETE)\b/);
  });

  it("no existe ruta de grabación en el portal", () => {
    expect(existsSync(path.join(CLASES_API, "[id]", "recording"))).toBe(false);
    const rutas = walk(CLASES_API).map((f) => path.relative(CLASES_API, f).replace(/\\/g, "/"));
    expect(rutas.some((r) => r.includes("recording"))).toBe(false);
  });

  it("el servidor del portal no tiene helpers que escriban asistencia o grabación", () => {
    const src = leer("src", "server", "teacher-portal.ts");
    expect(src).not.toMatch(/\bteacherMarkAttendance\b/);
    expect(src).not.toMatch(/\bteacherSetRecording\b/);
    expect(src).not.toMatch(/\bmarkAttendance\b/);
  });

  it("la pantalla del grupo no ofrece cargar ni cambiar la grabación", () => {
    const src = leer("src", "components", "portal", "portal-cohort-client.tsx");
    expect(src).not.toContain("puedeCargarGrabacion");
    expect(src).not.toContain("Cargar grabación");
    expect(src).not.toContain("Cambiar grabación");
    expect(src).not.toContain("/recording");
  });

  it("la planilla del profesor no marca: sin escrituras, sin «Todos presentes», sin botones de estado", () => {
    const src = leer("src", "components", "portal", "portal-attendance-sheet.tsx");
    expect(src).not.toMatch(/method:\s*["'](PUT|POST|PATCH|DELETE)["']/);
    expect(src).not.toContain("textoTodosPresentes");
    expect(src).not.toContain("aria-pressed");
  });
});
