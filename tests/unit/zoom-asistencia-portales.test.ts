import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Constitución 1.9.0 (e) — Nada de la asistencia sugerida desde Zoom viaja a
 * los portales: ni los tramos crudos, ni lo aprendido, ni el estado de la
 * traída. Los portales leen la asistencia CONFIRMADA de siempre.
 */

const raiz = process.cwd();
function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

const SUPERFICIES_DE_PORTAL = [
  ...walk(path.join(raiz, "src", "app", "api", "portal")),
  ...walk(path.join(raiz, "src", "app", "(portal)")),
  ...walk(path.join(raiz, "src", "components", "portal")),
  path.join(raiz, "src", "server", "student-portal.ts"),
  path.join(raiz, "src", "server", "teacher-portal.ts"),
  path.join(raiz, "src", "lib", "portal-api.ts"),
].filter((f) => existsSync(f));

const PROHIBIDO =
  /zoomParticipantSegment|zoomParticipantAlias|zoomAttendanceFetch|zoom_participant|zoom_attendance|zoom-attendance|attendance-review|attendance-fetch|zoomMinutes/;

describe("la asistencia sugerida no llega a los portales", () => {
  it("encuentra las superficies del portal (sanidad)", () => {
    expect(SUPERFICIES_DE_PORTAL.length).toBeGreaterThan(10);
  });

  it.each(SUPERFICIES_DE_PORTAL.map((f) => path.relative(raiz, f).split(path.sep).join("/")))("%s", (rel) => {
    expect(readFileSync(path.join(raiz, rel), "utf8")).not.toMatch(PROHIBIDO);
  });

  it("las rutas de la sugerencia piden capacidades de STAFF", () => {
    const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");
    expect(leer("src/app/api/class-sessions/[id]/zoom-attendance/route.ts")).toMatch(/requireCapability\("asistencia\.editar"/);
    expect(leer("src/app/api/class-sessions/[id]/zoom-attendance/confirm/route.ts")).toMatch(
      /requireCapability\("asistencia\.editar"/
    );
    for (const p of [
      "src/app/api/settings/zoom/attendance/route.ts",
      "src/app/api/settings/zoom/attendance/backfill/route.ts",
      "src/app/api/settings/zoom/aliases/route.ts",
      "src/app/api/settings/zoom/aliases/[id]/route.ts",
    ]) {
      expect(leer(p)).toMatch(/requireCapability\(\s*"configuracion\.editar"/);
    }
  });

  it("lo único que escribe asistencia desde Zoom es la confirmación", () => {
    const review = readFileSync(path.join(raiz, "src/server/zoom/attendance-review.ts"), "utf8");
    expect(review.match(/origen: "zoom"/g)?.length).toBe(2);
    expect(review).not.toMatch(/insert\(schema\.attendance\)/);
    for (const f of walk(path.join(raiz, "src"))) {
      // `markAttendance` DECLARA la opción; no la usa.
      if (f.endsWith(path.join("server", "attendance.ts"))) continue;
      const src = readFileSync(f, "utf8");
      if (/origen: "zoom"/.test(src)) {
        expect(path.relative(raiz, f).split(path.sep).join("/")).toBe("src/server/zoom/attendance-review.ts");
      }
    }
  });
});
