import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 043 — El vencimiento se hace cumplir en el SERVIDOR.
 *
 * El doble de base responde POR TABLA (no por orden de llegada): los módulos
 * de acá consultan en paralelo y el orden exacto no es lo que se prueba. Lo
 * que se prueba es qué VIAJA cuando el acceso venció.
 */

const tablas: Record<string, unknown[]> = {};
const inserts: { table: string; values: unknown }[] = [];

function chain() {
  let tabla = "";
  const c: Record<string, unknown> = {};
  c.from = (t: { __name: string }) => {
    tabla = t.__name;
    return c;
  };
  for (const m of ["innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) c[m] = () => c;
  (c as { then: unknown }).then = (resolve: (v: unknown) => void) =>
    Promise.resolve(tablas[tabla] ?? []).then(resolve);
  return c;
}

vi.mock("@/lib/db", () => ({
  getRootDb: () => ({}),
  getDb: () => ({
    select: () => chain(),
    selectDistinct: () => chain(),
    insert: (t: { __name: string }) => ({
      values: (values: unknown) => {
        inserts.push({ table: t.__name, values });
        const r = {
          onConflictDoNothing: () => r,
          returning: () => Promise.resolve([{ id: "x" }]),
        };
        return r;
      },
    }),
  }),
  schema: new Proxy(
    {},
    {
      get: (_t, tableName) =>
        new Proxy(
          {},
          {
            get: (_t2, col) => (col === "__name" ? String(tableName) : `${String(tableName)}.${String(col)}`),
          }
        ),
    }
  ),
}));

const estados = new Map<string, { vencido: boolean; hasta: string | null }>();
vi.mock("@/server/access-expiry", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/access-expiry")>();
  return {
    ...real,
    estadosDeAccesoDeContacto: async () => mapaDeEstados(),
    estadosDeAcceso: async (_org: string, ids: string[]) =>
      new Map([...mapaDeEstados()].filter(([id]) => ids.includes(id))),
    zonaDeLaOrganizacion: async () => "America/Montevideo",
  };
});

function mapaDeEstados() {
  return new Map(
    [...estados].map(([id, e]) => [
      id,
      {
        hasta: e.hasta,
        calculada: e.hasta,
        referencia: null,
        origen: "calculado" as const,
        vencido: e.vencido,
        terminaEn: e.hasta ? `${e.hasta}T23:59:59.000Z` : null,
        heredadoDe: null,
        fijadoPor: null,
        fijadoEn: null,
      },
    ])
  );
}

const listAnnouncements = vi.fn(async () => [{ id: "anc_1", title: "Aviso" }]);
const listCohortMaterial = vi.fn(async () => [{ id: "res_1", title: "Guía", url: "https://x" }]);
const listResources = vi.fn(async () => []);
vi.mock("@/server/resources", () => ({ listAnnouncements, listCohortMaterial, listResources }));

beforeEach(() => {
  for (const k of Object.keys(tablas)) delete tablas[k];
  inserts.length = 0;
  estados.clear();
  listAnnouncements.mockClear();
  listCohortMaterial.mockClear();
  vi.resetModules();
});

const ORG = "org_1";
const CT = "ct_1";
// Martes 2026-10-20, 18:40 en Montevideo: la clase de las 18:30 está en vivo.
const AHORA = new Date("2026-10-20T21:40:00.000Z");

function cursada() {
  tablas.organization = [{ timezone: "America/Montevideo", before: 15, after: 30 }];
  tablas.contact = [{ firstName: "Ana", lastName: "Pérez", email: "ana@example.com" }];
  tablas.enrollment = [
    {
      enrollment: {
        id: "enr_1",
        contactId: CT,
        cohortId: "coh_1",
        parentEnrollmentId: null,
        enrolledAt: null,
        currency: "UYU",
        companyId: null,
        attendanceWaiverAt: null,
        attendanceWaiverReason: null,
        attendanceWaiverRevokedAt: null,
      },
      cohort: {
        id: "coh_1",
        name: "Revit Octubre",
        status: "en_curso",
        startDate: new Date("2026-10-01T00:00:00.000Z"),
        endDate: new Date("2026-10-31T00:00:00.000Z"),
        frequency: null,
        classroom: null,
        meetingUrl: "https://zoom.us/j/123",
        minAttendancePct: null,
        parentCohortId: null,
        position: null,
      },
      course: { id: "crs_1", name: "Revit", minAttendancePct: null },
      teacherName: null,
      waiverAuthorName: null,
    },
  ];
  tablas.classSession = [
    {
      id: "cls_1",
      cohortId: "coh_1",
      number: 1,
      date: new Date("2026-10-20T00:00:00.000Z"),
      startTime: "18:30",
      endTime: "20:30",
      topic: null,
      canceledAt: null,
      cancelReason: null,
      meetingUrl: null,
      recordingUrl: "https://zoom.us/rec/share/abc",
    },
  ];
}

describe("043 — el detalle de una cursada", () => {
  it("vigente: grabación, enlace, material, avisos y próxima clase viajan", async () => {
    cursada();
    estados.set("enr_1", { vencido: false, hasta: "2026-11-30" });
    const { studentCourseDetail } = await import("@/server/student-portal");
    const d = await studentCourseDetail(ORG, CT, "enr_1", AHORA);
    expect(d!.classes[0]!.recordingUrl).toBe("https://zoom.us/rec/share/abc");
    expect(d!.classes[0]!.meetingUrl).toBe("https://zoom.us/j/123");
    expect(d!.resources).toHaveLength(1);
    expect(d!.announcements).toHaveLength(1);
    expect(d!.nextClass?.meetingUrl).toBe("https://zoom.us/j/123");
    expect(d!.course.access).toEqual({ until: "2026-11-30", expired: false, notice: null });
  });

  it("vencida: la cursada sigue (clases y asistencia), sin grabación, enlace, material ni avisos", async () => {
    cursada();
    estados.set("enr_1", { vencido: true, hasta: "2026-10-01" });
    const { studentCourseDetail } = await import("@/server/student-portal");
    const d = await studentCourseDetail(ORG, CT, "enr_1", AHORA);
    expect(d).not.toBeNull();
    expect(d!.classes).toHaveLength(1);
    expect(d!.classes[0]!.recordingUrl).toBeNull();
    expect(d!.classes[0]!.meetingUrl).toBeNull();
    expect(d!.resources).toEqual([]);
    expect(d!.announcements).toEqual([]);
    expect(d!.nextClass).toBeNull();
    // Ni se consultaron: un dato que no se debe ver no viaja.
    expect(listAnnouncements).not.toHaveBeenCalled();
    expect(listCohortMaterial).not.toHaveBeenCalled();
    expect(d!.course.access).toEqual({
      until: "2026-10-01",
      expired: true,
      notice: { tipo: "finalizado", hasta: "2026-10-01" },
    });
  });
});

describe("043 — el inicio del alumno", () => {
  it("una cursada vencida queda en el historial, sin próxima clase", async () => {
    cursada();
    estados.set("enr_1", { vencido: true, hasta: "2026-10-01" });
    const { studentOverview } = await import("@/server/student-portal");
    const o = await studentOverview(ORG, CT, AHORA);
    expect(o!.courses).toHaveLength(1);
    expect(o!.courses[0]!.access.expired).toBe(true);
    expect(o!.nextClass).toBeNull();
  });

  it("vigente, la próxima clase lleva su enlace", async () => {
    cursada();
    estados.set("enr_1", { vencido: false, hasta: "2026-11-30" });
    const { studentOverview } = await import("@/server/student-portal");
    const o = await studentOverview(ORG, CT, AHORA);
    expect(o!.nextClass?.meetingUrl).toBe("https://zoom.us/j/123");
  });

  it("sin inscripciones el portal responde igual (alumno con solo un acceso directo)", async () => {
    tablas.organization = [{ timezone: "America/Montevideo", before: 15, after: 30 }];
    tablas.contact = [{ firstName: "Bruno", lastName: null, email: "b@example.com" }];
    const { studentOverview } = await import("@/server/student-portal");
    const o = await studentOverview(ORG, CT, AHORA);
    expect(o).not.toBeNull();
    expect(o!.courses).toEqual([]);
    expect(o!.nextClass).toBeNull();
  });
});

/* ============================================================
 * Cursos offline
 * ============================================================ */

function bibliotecaDe() {
  tablas.enrollment = [
    { id: "enr_vieja", cohortId: "coh_vieja", createdAt: new Date("2025-01-01") },
    { id: "enr_nueva", cohortId: "coh_nueva", createdAt: new Date("2026-01-01") },
  ];
  tablas.offlineCourseAccess = [
    { id: "a1", cohortId: "coh_vieja", enrollmentId: null, courseId: "ocrs_A", mode: null },
    { id: "a2", cohortId: null, enrollmentId: "enr_vieja", courseId: "ocrs_B", mode: "grant" },
    { id: "a3", cohortId: "coh_nueva", enrollmentId: null, courseId: "ocrs_C", mode: null },
  ];
  tablas.offlineCourseGrant = [
    { id: "g1", contactId: CT, courseId: "ocrs_D", accessUntil: new Date("2027-01-31T00:00:00.000Z") },
    { id: "g2", contactId: CT, courseId: "ocrs_E", accessUntil: new Date("2026-01-31T00:00:00.000Z") },
  ];
  estados.set("enr_vieja", { vencido: true, hasta: "2025-12-31" });
  estados.set("enr_nueva", { vencido: false, hasta: "2026-12-31" });
}

describe("043 — cursos offline: cohorte vigente ∪ acceso directo vigente", () => {
  it("la cohorte vencida no da nada (ni lo del grupo ni lo otorgado); el acceso directo vencido tampoco", async () => {
    bibliotecaDe();
    const { offlineAccessForContact } = await import("@/server/offline-courses/access");
    const acceso = await offlineAccessForContact(ORG, CT, new Date("2026-10-19T12:00:00.000Z"));
    expect([...acceso.keys()].sort()).toEqual(["ocrs_C", "ocrs_D"]);
    expect(acceso.get("ocrs_C")).toBe("2026-12-31");
    expect(acceso.get("ocrs_D")).toBe("2027-01-31");
  });

  it("el intento se registra contra la inscripción vigente, o sin inscripción si llega por acceso directo", async () => {
    bibliotecaDe();
    const { effectiveAccessByEnrollment } = await import("@/server/offline-courses/access");
    const r = await effectiveAccessByEnrollment(ORG, CT, new Date("2026-10-19T12:00:00.000Z"));
    expect(r.enrollments.map((e) => e.id)).toEqual(["enr_nueva"]);
    expect(r.directCourseIds).toEqual(["ocrs_D"]);
  });

  it("un cuestionario de un curso vencido responde 404 y no escribe nada", async () => {
    bibliotecaDe();
    const { submitAttempt } = await import("@/server/offline-courses/submit");
    const r = await submitAttempt(ORG, CT, "ocrs_A", "oqz_1", { answers: {} });
    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(inserts).toEqual([]);
  });

  it("un cuestionario de un curso con acceso directo se registra sin inscripción", async () => {
    bibliotecaDe();
    tablas.offlineQuiz = [{ id: "oqz_1", passingPercentage: 60, retriesAllowed: null }];
    tablas.offlineQuizAttempt = [{ n: 0, last: null }];
    tablas.offlineQuestion = [{ id: "q1", questionMd: "¿?", answerType: "single", points: 1 }];
    tablas.offlineAnswer = [{ id: "a1", questionId: "q1", text: "Sí", isCorrect: true }];
    const { submitAttempt } = await import("@/server/offline-courses/submit");
    const r = await submitAttempt(ORG, CT, "ocrs_D", "oqz_1", { answers: { q1: ["a1"] } });
    expect(r.ok).toBe(true);
    expect(inserts).toHaveLength(1);
    expect(inserts[0]!.values).toMatchObject({ enrollmentId: null, contactId: CT, passed: true });
  });
});
