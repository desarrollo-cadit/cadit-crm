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

describe("030 US6 — los portales no leen las tablas de Zoom", () => {
  it("ningún módulo de portal nombra zoom_recording / zoomRecording ni las demás tablas de Zoom", () => {
    const culpables = MODULOS.filter((f) =>
      /\bzoom_?[Rr]ecording(_?[Cc]lass)?\b|\bzoom_?[Cc]onnection\b|\bzoom_?[Ss]ync_?[Rr]un\b|\bzoomRecording\b/.test(
        sinComentarios(readFileSync(f, "utf8"))
      )
    ).map(rel);
    expect(culpables).toEqual([]);
  });

  /**
   * 2026-10-26 — Ya no hay excepción: la grabación la carga Coordinación, así
   * que el portal no tiene a quién liberar (R6 vive en la ruta del staff).
   */
  it("ningún módulo de portal importa src/server/zoom/*", () => {
    const imports = MODULOS.flatMap((f) => {
      const src = sinComentarios(readFileSync(f, "utf8"));
      return [...src.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)]
        .filter(([, , from]) => /server\/zoom|lib\/zoom/.test(from ?? ""))
        .map(([, what, from]) => ({ file: rel(f), what: (what ?? "").replace(/\s+/g, " ").trim(), from }));
    });
    expect(imports).toEqual([]);
  });

  it("no hay rutas nuevas bajo api/portal (FR-025): las grabaciones viajan por las vistas de clase de siempre", () => {
    const rutas = walk(PORTAL_API)
      .filter((f) => /route\.ts$/.test(f))
      .map((f) => rel(f).replace("src/app/api/portal/", ""))
      .sort();
    expect(rutas).toEqual(
      [
        // 031 — la corrección versionada del profesor; no lee tablas de Zoom.
        "assessments/[id]/corrections/[enrollmentId]/route.ts",
        "assessments/[id]/plazo/route.ts",
        "assessments/[id]/results/route.ts",
        "classes/[id]/attendance/route.ts",
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
        // 0083 — el pedido de prórroga del alumno; no lee tablas de Zoom.
        "me/assessments/[id]/extension-request/route.ts",
        // 038 — el PDF del certificado del alumno; no lee tablas de Zoom.
        "me/certificados/[code]/pdf/route.ts",
        "me/certificados/route.ts",
        // 031 — las correcciones publicadas del alumno; no lee tablas de Zoom.
        "me/correcciones/route.ts",
        "me/cuenta/route.ts",
        "me/cursadas/[id]/route.ts",
        "me/entregas/route.ts",
        // 031 — la escolaridad imprimible del alumno; no lee tablas de Zoom.
        "me/escolaridad/print/route.ts",
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
   * y el descarte no lo conocía: viajaba al portal del profesor. Desde
   * 2026-10-26 el profesor ya no lo escribe (la grabación la carga
   * Coordinación): solo lo DESCARTA al listar.
   */
  it("el profesor: recording_source solo aparece para descartarlo de la lista de staff", () => {
    const profe = sinComentarios(readFileSync(path.join(ROOT, "src", "server", "teacher-portal.ts"), "utf8"));
    const usos = profe.split("\n").filter((l) => /recordingSource|recording_source/.test(l));
    expect(usos).toHaveLength(1);
    expect(usos[0]).toMatch(/recordingSource:\s*_\w*/);
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

/**
 * 2026-10-28 — Grabación compartida: Estudiantes y Profesionales comparten las
 * clases 1 a 3 (misma reunión, misma hora); Profesionales tiene además la 4.
 * La adjudicación proyecta la MISMA grabación en la clase de cada grupo, y el
 * portal de cada grupo la ve por SU clase. La clase extra de Profesionales
 * nunca es una clase de Estudiantes, así que no tiene por dónde llegarles.
 */
describe("2026-10-28 — grabación compartida entre dos grupos", () => {
  it("llega a los alumnos de los dos grupos por recording_url, y la clase extra solo al grupo largo", async () => {
    const { applyMatch } = await import("@/server/zoom/assignment");
    type Deps = NonNullable<Parameters<typeof applyMatch>[3]>;

    const inicio = new Date("2026-10-01T21:30:00Z");
    const fin = new Date("2026-10-02T00:30:00Z");
    const clases = new Map(
      ["est_3", "pro_3", "pro_4"].map((id) => [
        id,
        { id, canceledAt: null as Date | null, recordingUrl: null as string | null, recordingSource: null as "manual" | "zoom" | null },
      ])
    );
    const grabaciones = new Map<string, { id: string; classSessionIds: string[]; assignmentState: string; [k: string]: unknown }>();
    const grabacion = (id: string, meetingId: string, start: Date) =>
      grabaciones.set(id, {
        id,
        zoomConnectionId: "zc_1",
        zoomMeetingId: meetingId,
        hostZoomUserId: "u1",
        startTime: start,
        durationMin: 120,
        playUrl: `https://zoom.us/rec/share/${id}`,
        classSessionIds: [],
        assignmentMode: "auto",
        assignmentState: "pendiente",
        candidateClassIds: [],
        conflictClassSessionId: null,
        assignedBy: null,
        assignedAt: null,
      });
    grabacion("compartida", "9990000001", new Date("2026-10-01T21:34:00Z"));
    grabacion("solo_pro", "9990000001", new Date("2026-10-08T21:34:00Z"));

    const deps = {
      now: () => new Date("2026-10-09T12:00:00Z"),
      loadContext: async () => ({ classes: [], rooms: [], tolerance: { beforeMin: 30, afterFallbackMin: 180 } }),
      run: async (_org: string, fn: (tx: never) => Promise<unknown>) =>
        fn({
          async lockClasses() {},
          async getRecording(id: string) {
            const g = grabaciones.get(id);
            return g ? { ...g } : null;
          },
          async getClass(id: string) {
            const c = clases.get(id);
            return c ? { ...c } : null;
          },
          async recordingOnClass(classId: string) {
            const g = [...grabaciones.values()].find((x) => x.classSessionIds.includes(classId));
            return g ? { id: g.id, assignmentMode: "auto", durationMin: 120 } : null;
          },
          async updateRecording(id: string, patch: object) {
            Object.assign(grabaciones.get(id)!, patch);
          },
          async releaseConflicts() {
            return 0;
          },
          async updateClass(id: string, patch: object) {
            Object.assign(clases.get(id)!, patch);
          },
        } as never),
    } as unknown as Deps;

    const clase = (classSessionId: string, cohortId: string, startsAt: Date, endsAt: Date) => ({
      classSessionId,
      cohortId,
      startsAt,
      endsAt,
      meetingId: "9990000001",
      roomId: null,
    });
    const semana = 7 * 86_400_000;
    const ctx = {
      classes: [
        clase("est_3", "coh_est", inicio, fin),
        clase("pro_3", "coh_pro", inicio, fin),
        clase("pro_4", "coh_pro", new Date(inicio.getTime() + semana), new Date(fin.getTime() + semana)),
      ],
      rooms: [],
      tolerance: { beforeMin: 30, afterFallbackMin: 180 },
    };
    expect(await applyMatch("org_1", "compartida", ctx, deps)).toBe("asignada");
    expect(await applyMatch("org_1", "solo_pro", ctx, deps)).toBe("asignada");

    // Lo que cada portal arma: las filas de las clases de SU grupo.
    const filaDe = (id: string) =>
      buildClassRow({
        id,
        number: 3,
        projected: false,
        date: new Date("2026-10-01T00:00:00Z"),
        startTime: "18:30",
        endTime: "21:30",
        topic: null,
        canceledAt: null,
        cancelReason: null,
        meetingUrl: null,
        cohortMeetingUrl: null,
        recordingUrl: clases.get(id)!.recordingUrl,
        timezone: "America/Montevideo",
        window: { beforeMin: 15, afterMin: 15 },
        now: new Date("2026-10-20T12:00:00Z"),
      });
    const estudiantes = ["est_3"].map(filaDe);
    const profesionales = ["pro_3", "pro_4"].map(filaDe);

    expect(estudiantes.map((f) => f.recordingUrl)).toEqual(["https://zoom.us/rec/share/compartida"]);
    expect(profesionales.map((f) => f.recordingUrl)).toEqual([
      "https://zoom.us/rec/share/compartida",
      "https://zoom.us/rec/share/solo_pro",
    ]);
    expect(JSON.stringify(estudiantes)).not.toContain("solo_pro");
  });
});
