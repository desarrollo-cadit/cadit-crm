import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildClassRow } from "@/server/classes";

/**
 * 030 US6 (DV-007, FR-025) — Profesores y alumnos ven solo lo suyo.
 *
 * La grabación de Zoom llega a un portal por UN solo camino: la sincronización
 * la adjudica a una clase y la proyecta sobre `class_session.recording_url`,
 * que los portales ya mostraban (con el alcance y la cancelación de siempre).
 * Una grabación SIN adjudicar no tiene clase, así que no tiene por dónde
 * llegar — siempre que ningún módulo de portal lea las tablas de Zoom.
 *
 * Estos guards son estructurales a propósito: una consulta de más a
 * `zoom_recording` compila, responde 200 y le muestra a un alumno la grabación
 * de otra cohorte. El comportamiento (alumno de A la ve, alumno de B no) lo
 * conduce el arnés E2E (`scripts/e2e/grabaciones-zoom.mjs`, checks 8 y 9).
 */

const ROOT = process.cwd();
const rel = (p: string) => path.relative(ROOT, p).split(path.sep).join("/");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}

/** El archivo sin comentarios: las reglas hablan del código, no de la prosa. */
const sinComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

const PORTAL_API = path.join(ROOT, "src", "app", "api", "portal");
const MODULOS = [
  path.join(ROOT, "src", "server", "student-portal.ts"),
  path.join(ROOT, "src", "server", "teacher-portal.ts"),
  path.join(ROOT, "src", "lib", "portal-api.ts"),
  ...walk(PORTAL_API),
];

/** La única puerta permitida: liberar la grabación de Zoom cuando el profesor pega la suya (R6). */
const EXCEPCION = "src/app/api/portal/classes/[id]/recording/route.ts";

describe("030 US6 — los portales no leen las tablas de Zoom", () => {
  it("ningún módulo de portal nombra zoom_recording / zoomRecording ni las demás tablas de Zoom", () => {
    const culpables = MODULOS.filter((f) =>
      /\bzoom_?[Rr]ecording\b|\bzoom_?[Cc]onnection\b|\bzoom_?[Ss]ync_?[Rr]un\b|\bzoomRecording\b/.test(
        sinComentarios(readFileSync(f, "utf8"))
      )
    ).map(rel);
    expect(culpables).toEqual([]);
  });

  it("ningún módulo de portal importa src/server/zoom/*, salvo releaseForManualLink en la ruta del profesor", () => {
    const imports = MODULOS.flatMap((f) => {
      const src = sinComentarios(readFileSync(f, "utf8"));
      return [...src.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)]
        .filter(([, , from]) => /server\/zoom|lib\/zoom/.test(from ?? ""))
        .map(([, what, from]) => ({ file: rel(f), what: (what ?? "").replace(/\s+/g, " ").trim(), from }));
    });
    expect(imports).toEqual([
      { file: EXCEPCION, what: "{ releaseForManualLink }", from: "@/server/zoom/assignment" },
    ]);
  });

  it("no hay rutas nuevas bajo api/portal (FR-025): las grabaciones viajan por las vistas de clase de siempre", () => {
    const rutas = walk(PORTAL_API)
      .filter((f) => /route\.ts$/.test(f))
      .map((f) => rel(f).replace("src/app/api/portal/", ""))
      .sort();
    expect(rutas).toEqual(
      [
        "assessments/[id]/plazo/route.ts",
        "assessments/[id]/results/route.ts",
        "classes/[id]/attendance/route.ts",
        "classes/[id]/recording/route.ts",
        "classes/[id]/resources/route.ts",
        "cohorts/[id]/classes/route.ts",
        "cohorts/[id]/content/route.ts",
        "cohorts/[id]/entregas/route.ts",
        "cohorts/[id]/grading/route.ts",
        "cohorts/[id]/offline-attempts/route.ts",
        "cohorts/[id]/resources/route.ts",
        "cohorts/route.ts",
        "entregas/[id]/reabrir/route.ts",
        "entregas/[id]/route.ts",
        "hours/route.ts",
        "me/certificados/route.ts",
        "me/cuenta/route.ts",
        "me/cursadas/[id]/route.ts",
        "me/entregas/route.ts",
        "me/offline-courses/[id]/quizzes/[quizId]/attempts/route.ts",
        "me/offline-courses/[id]/quizzes/[quizId]/route.ts",
        "me/offline-courses/[id]/route.ts",
        "me/offline-courses/[id]/thumbnail/route.ts",
        "me/offline-courses/[id]/topics/[topicId]/progress/route.ts",
        "me/offline-courses/[id]/topics/[topicId]/route.ts",
        "me/offline-courses/route.ts",
        "me/route.ts",
      ].sort()
    );
  });
});

describe("030 US6 — la respuesta del portal no cambia", () => {
  it("el módulo del alumno no lee recording_source", () => {
    const alumno = sinComentarios(readFileSync(path.join(ROOT, "src", "server", "student-portal.ts"), "utf8"));
    expect(alumno).not.toMatch(/recordingSource|recording_source/);
  });

  /**
   * Encontrado por el arnés E2E (check 8): `teacherCohortClasses` reusa la
   * lista de STAFF (`listCohortClasses`, `StaffClassRowDto`) y le quita los
   * campos crudos uno por uno. US2 sumó `recordingSource` a la fila de staff
   * y el descarte no lo conocía: viajaba al portal del profesor. El profesor
   * solo lo ESCRIBE (al pegar su enlace) y lo DESCARTA al listar.
   */
  it("el profesor: recording_source solo se escribe al pegar su enlace y se descarta de la lista de staff", () => {
    const profe = sinComentarios(readFileSync(path.join(ROOT, "src", "server", "teacher-portal.ts"), "utf8"));
    const usos = profe.split("\n").filter((l) => /recordingSource|recording_source/.test(l));
    expect(usos).toHaveLength(2);
    expect(usos.some((l) => /\.set\(\{\s*recordingUrl,\s*recordingSource:/.test(l))).toBe(true);
    expect(usos.some((l) => /recordingSource:\s*_\w*/.test(l))).toBe(true);
  });

  it("todo campo que StaffClassRowDto agrega sobre ClassRowDto se descarta en teacherCohortClasses", () => {
    const clases = readFileSync(path.join(ROOT, "src", "server", "classes.ts"), "utf8");
    const staff = clases.slice(clases.indexOf("export type StaffClassRowDto"), clases.indexOf("export type CohortClassesDto"));
    const extras = [...sinComentarios(staff).matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
    expect(extras.length).toBeGreaterThan(0);
    const profe = sinComentarios(readFileSync(path.join(ROOT, "src", "server", "teacher-portal.ts"), "utf8"));
    const descarte = profe.slice(profe.indexOf("classes.classes.map("), profe.indexOf("...fila }) => fila"));
    expect(extras.filter((campo) => !new RegExp(`\\b${campo}:\\s*_`).test(descarte))).toEqual([]);
  });

  it("ClassRowDto (lo que arma buildClassRow para alumno y profesor) no tiene recordingSource", () => {
    const src = readFileSync(path.join(ROOT, "src", "server", "classes.ts"), "utf8");
    const tipo = src.slice(src.indexOf("export type ClassRowDto"), src.indexOf("export type StaffClassRowDto"));
    expect(tipo).toContain("recordingUrl");
    expect(tipo).not.toContain("recordingSource");
  });

  const base = {
    id: "cls_1",
    number: 1,
    projected: false,
    date: new Date("2026-10-01T00:00:00Z"),
    startTime: "18:30",
    endTime: "21:30",
    topic: null,
    canceledAt: null,
    cancelReason: null,
    meetingUrl: null,
    cohortMeetingUrl: null,
    recordingUrl: "https://zoom.us/rec/share/R1?pwd=x",
    timezone: "America/Montevideo",
    window: { beforeMin: 15, afterMin: 15 },
    now: new Date("2026-10-09T12:00:00Z"),
  } satisfies Parameters<typeof buildClassRow>[0];

  it("la fila de portal ofrece la grabación adjudicada y nada sobre su origen", () => {
    const row = buildClassRow(base);
    expect(row.recordingUrl).toBe("https://zoom.us/rec/share/R1?pwd=x");
    expect(Object.keys(row)).not.toContain("recordingSource");
  });

  it("una clase cancelada o proyectada no ofrece grabación aunque la tenga adjudicada", () => {
    expect(buildClassRow({ ...base, canceledAt: new Date("2026-10-01T10:00:00Z") }).recordingUrl).toBeNull();
    expect(buildClassRow({ ...base, projected: true }).recordingUrl).toBeNull();
  });
});
