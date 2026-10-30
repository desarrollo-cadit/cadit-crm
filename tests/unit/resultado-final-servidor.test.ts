import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 0086 — Confirmar el resultado final (decisión del dueño 2026-10-23):
 * ninguna aprobación es automática. Lo que se fija acá es la ESCRITURA:
 * cuándo se puede, sobre quién, qué queda guardado y qué pasa con el
 * certificado de quien se reprueba.
 */

const selectQueue: unknown[][] = [];
const upserts: { values: Record<string, unknown>; set: Record<string, unknown> }[] = [];
const revocaciones: { certificateId: string; reason: string; revokedBy: string | null }[] = [];

function thenableChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "innerJoin", "leftJoin", "where", "groupBy", "orderBy", "limit"]) {
    chain[m] = () => chain;
  }
  (chain as { then: unknown }).then = (resolve: (v: unknown) => void) => Promise.resolve(rows).then(resolve);
  return chain;
}

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => thenableChain(selectQueue.shift() ?? []),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async (o: { set: Record<string, unknown> }) => {
          upserts.push({ values, set: o.set });
        },
      }),
    }),
  }),
  schema: new Proxy(
    {},
    { get: (_t, table) => new Proxy({}, { get: (_t2, col) => `${String(table)}.${String(col)}` }) }
  ),
}));

type Alumno = {
  enrollmentId: string;
  contactName: string;
  results: Record<string, boolean | null>;
  attendancePct: number | null;
  attendance: { presentes: number; cuentan: number };
  state: "aprobado" | "reprobado" | "pendiente";
  reasons: string[];
  finalResult: null;
  certificate: null;
};
const planilla = vi.hoisted(() => ({
  students: [] as Alumno[],
  grupoCompleto: true,
}));

vi.mock("@/server/taller-config", () => ({ exigirEvaluacionesDeGrupo: async () => null }));

vi.mock("@/server/grading", () => ({
  cohortGrading: async () => ({
    assessments: [{ id: "as_1", required: true }],
    minAttendancePct: 75,
    timezone: "America/Montevideo",
    grupoCompleto: planilla.grupoCompleto,
    students: planilla.students,
  }),
}));

vi.mock("@/server/certificates", () => ({
  revokeCertificate: async (_org: string, certificateId: string, i: { reason: string; revokedBy: string | null }) => {
    revocaciones.push({ certificateId, ...i });
    return { ok: true, data: {} };
  },
}));

const AHORA = new Date("2026-10-29T15:00:00.000Z");
const TERMINADO = { startDate: new Date("2026-08-01T00:00:00Z"), endDate: new Date("2026-10-20T00:00:00Z") };
const EN_CURSO = { startDate: new Date("2026-08-01T00:00:00Z"), endDate: new Date("2026-11-20T00:00:00Z") };

function alumno(id: string, state: Alumno["state"], over: Partial<Alumno> = {}): Alumno {
  return {
    enrollmentId: id,
    contactName: `Alumno ${id}`,
    results: { as_1: state === "aprobado" ? true : state === "reprobado" ? false : null },
    attendancePct: 90,
    attendance: { presentes: 9, cuentan: 10 },
    state,
    reasons: [],
    finalResult: null,
    certificate: null,
    ...over,
  };
}

beforeEach(() => {
  selectQueue.length = 0;
  upserts.length = 0;
  revocaciones.length = 0;
  planilla.students = [];
  planilla.grupoCompleto = true;
  vi.resetModules();
});

describe("cierreDeCursada — la lista para confirmar", () => {
  it("trae asistencia X de Y, evaluaciones obligatorias y la SUGERENCIA de cada alumno", async () => {
    planilla.students = [alumno("enr_1", "aprobado"), alumno("enr_2", "pendiente")];
    selectQueue.push([TERMINADO]); // fechas del grupo
    selectQueue.push([]); // ninguna es madre

    const { cierreDeCursada } = await import("@/server/final-results");
    const c = await cierreDeCursada("org_1", "coh_1", AHORA);

    expect(c!.estadoDelGrupo).toBe("finalizada");
    expect(c!.confirmable).toBe(true);
    expect(c!.alumnos[0]).toMatchObject({
      asistencia: { presentes: 9, cuentan: 10, pct: 90 },
      evaluaciones: { obligatorias: 1, aprobadas: 1, reprobadas: 0, sinCorregir: 0 },
      sugerido: "aprobado",
      confirmado: null,
      porModulos: false,
    });
    expect(c!.alumnos[1]!.evaluaciones.sinCorregir).toBe(1);
  });
});

describe("confirmarResultados", () => {
  it("con el grupo en curso responde 422 grupo_no_finalizado y no escribe", async () => {
    planilla.students = [alumno("enr_1", "aprobado")];
    selectQueue.push([EN_CURSO]);
    selectQueue.push([]);

    const { confirmarResultados } = await import("@/server/final-results");
    const r = await confirmarResultados("org_1", "coh_1", [{ enrollmentId: "enr_1", result: "aprobado" }], "usr_1", AHORA);

    expect(r).toMatchObject({ ok: false, status: 422, code: "grupo_no_finalizado" });
    expect(upserts).toHaveLength(0);
  });

  it("2026-10-29 — un grupo terminado sin la asistencia completa: 422 grupo_incompleto, sin escribir", async () => {
    planilla.students = [alumno("enr_1", "aprobado")];
    planilla.grupoCompleto = false;
    selectQueue.push([TERMINADO]);
    selectQueue.push([]);

    const { cierreDeCursada, confirmarResultados } = await import("@/server/final-results");
    const r = await confirmarResultados("org_1", "coh_1", [{ enrollmentId: "enr_1", result: "aprobado" }], "usr_1", AHORA);
    expect(r).toMatchObject({ ok: false, status: 422, code: "grupo_incompleto" });
    if (!r.ok) expect(r.message).toContain("asistencia");
    expect(upserts).toHaveLength(0);

    selectQueue.push([TERMINADO]);
    selectQueue.push([]);
    const c = await cierreDeCursada("org_1", "coh_1", AHORA);
    expect(c).toMatchObject({ confirmable: false, grupoCompleto: false });
  });

  it("una inscripción de OTRO grupo responde 404 y no escribe nada", async () => {
    planilla.students = [alumno("enr_1", "aprobado")];
    selectQueue.push([TERMINADO]);
    selectQueue.push([]);

    const { confirmarResultados } = await import("@/server/final-results");
    const r = await confirmarResultados(
      "org_1",
      "coh_1",
      [
        { enrollmentId: "enr_1", result: "aprobado" },
        { enrollmentId: "enr_ajena", result: "aprobado" },
      ],
      "usr_1",
      AHORA
    );

    expect(r).toMatchObject({ ok: false, status: 404 });
    expect(upserts).toHaveLength(0);
  });

  it("la madre de una especialización no se confirma: sale de sus módulos", async () => {
    planilla.students = [alumno("enr_madre", "pendiente")];
    selectQueue.push([TERMINADO]);
    selectQueue.push([{ parentEnrollmentId: "enr_madre" }]); // tiene hijas

    const { confirmarResultados } = await import("@/server/final-results");
    const r = await confirmarResultados("org_1", "coh_1", [{ enrollmentId: "enr_madre", result: "aprobado" }], "usr_1", AHORA);

    expect(r).toMatchObject({ ok: false, status: 422, code: "se_confirma_por_modulos" });
    expect(upserts).toHaveLength(0);
  });

  it("guarda el resultado, la sugerencia del momento y quién confirmó (corregir PISA la fila)", async () => {
    planilla.students = [alumno("enr_1", "aprobado")];
    selectQueue.push([TERMINADO]);
    selectQueue.push([]);

    const { confirmarResultados } = await import("@/server/final-results");
    // El profesor reprueba aunque la sugerencia diga aprobado.
    selectQueue.push([{ id: "enr_1", parentEnrollmentId: null }]); // anular: inscripciones
    selectQueue.push([]); // sin certificados vigentes
    const r = await confirmarResultados(
      "org_1",
      "coh_1",
      [{ enrollmentId: "enr_1", result: "reprobado", note: "No entregó el final" }],
      "usr_1",
      AHORA
    );

    expect(r.ok).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]!.values).toMatchObject({
      organizationId: "org_1",
      enrollmentId: "enr_1",
      result: "reprobado",
      suggestedResult: "aprobado",
      note: "No entregó el final",
      confirmedBy: "usr_1",
      confirmedAt: AHORA,
    });
    expect(upserts[0]!.set).toMatchObject({ result: "reprobado", confirmedBy: "usr_1", confirmedAt: AHORA });
  });

  it("reprobar ANULA el certificado vigente del alumno y el general de su especialización", async () => {
    planilla.students = [alumno("enr_m1", "aprobado")];
    selectQueue.push([TERMINADO]);
    selectQueue.push([]);
    selectQueue.push([{ id: "enr_m1", parentEnrollmentId: "enr_madre" }]);
    selectQueue.push([
      { id: "cert_mod", enrollmentId: "enr_m1" },
      { id: "cert_gral", enrollmentId: "enr_madre" },
    ]);

    const { confirmarResultados } = await import("@/server/final-results");
    const r = await confirmarResultados("org_1", "coh_1", [{ enrollmentId: "enr_m1", result: "reprobado" }], "usr_9", AHORA);

    expect(r).toEqual({ ok: true, data: { confirmados: 1, certificadosAnulados: 2 } });
    expect(revocaciones.map((x) => x.certificateId)).toEqual(["cert_mod", "cert_gral"]);
    expect(revocaciones[0]!.revokedBy).toBe("usr_9");
    expect(revocaciones[0]!.reason).toContain("reprobado");
  });

  it("aprobar no anula nada", async () => {
    planilla.students = [alumno("enr_1", "reprobado")];
    selectQueue.push([TERMINADO]);
    selectQueue.push([]);

    const { confirmarResultados } = await import("@/server/final-results");
    const r = await confirmarResultados("org_1", "coh_1", [{ enrollmentId: "enr_1", result: "aprobado" }], "usr_1", AHORA);

    expect(r).toEqual({ ok: true, data: { confirmados: 1, certificadosAnulados: 0 } });
    expect(revocaciones).toHaveLength(0);
  });
});

/* ============================================================
 * Las puertas: profesor (su alcance, 404) y staff (capacidad)
 * ============================================================ */

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

describe("las rutas de confirmación", () => {
  it("el portal del profesor entra por requireTeacherPortal y nunca por una capacidad de staff", () => {
    const src = leer("src/app/api/portal/cohorts/[id]/final-results/route.ts");
    expect(src).toContain("requireTeacherPortal");
    expect(src).not.toContain("requireCapability");
  });

  it("el staff confirma con correcciones.aprobar y lee con evaluacion.ver", () => {
    const src = leer("src/app/api/cohorts/[id]/final-results/route.ts");
    expect(src).toMatch(/requireCapability\(\s*"correcciones\.aprobar"/);
    expect(src).toMatch(/requireCapability\("evaluacion\.ver"/);
    expect(src).not.toContain("requireTeacherPortal");
  });

  it("el profesor no recibe el estado del certificado (es de la academia)", () => {
    const src = leer("src/server/teacher-portal.ts");
    expect(src).toMatch(/certificado: _certificado/);
  });
});
