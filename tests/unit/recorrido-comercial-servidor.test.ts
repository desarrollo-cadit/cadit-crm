import { describe, expect, it, vi } from "vitest";

/**
 * 046 (T008; research R2, R3) — De las filas leídas a las cursadas que
 * consume la derivación pura: aprobación con la regla del legajo, marca de
 * "nunca se dictó" desde `inscripcionesNoDictadas`, certificado vigente.
 */

vi.mock("@/lib/db", () => ({ getDb: () => ({}), schema: {} }));

const { armarCursadasComerciales } = await import("@/server/recorrido-comercial");

const reloj = { timeZone: "America/Montevideo", now: new Date("2026-10-23T12:00:00Z") };

function inscripcion(id: string, p: { parent?: string | null; cohortId?: string; waiver?: boolean } = {}) {
  return {
    enrollment: {
      id,
      contactId: "ct_ana",
      parentEnrollmentId: p.parent ?? null,
      enrolledAt: null,
      attendanceWaiverAt: p.waiver ? new Date("2025-04-01") : null,
      attendanceWaiverReason: p.waiver ? "Viaje" : null,
      attendanceWaiverRevokedAt: null,
    },
    waiverAuthorName: null,
    stageKind: "open" as const,
    cohort: {
      id: p.cohortId ?? `coh_${id}`,
      name: "Marzo",
      startDate: new Date("2025-03-01"),
      endDate: new Date("2025-05-01"),
      minAttendancePct: 75,
    },
    course: { id: "crs_arq", name: "Revit Arquitectura", kind: "curso" as const, categoryId: "cat_bim", minAttendancePct: null },
  };
}

/** 2026-10-29 — Una clase con lista por grupo: sin ella el grupo terminó INCOMPLETO y no tiene resultado. */
const conLista = (cohortId: string) => ({
  id: `s_${cohortId}`,
  cohortId,
  date: new Date("2025-03-05T00:00:00Z"),
  endTime: "21:00",
  canceledAt: null,
  tomada: true,
});

const vacias = {
  clases: [conLista("coh_e1"), conLista("coh_e2")],
  asistencias: [],
  evaluaciones: [],
  resultados: [],
  certificados: [],
  resultadosFinales: [],
  noDictadas: new Set<string>(),
  reloj,
};

describe("armarCursadasComerciales", () => {
  it("aprobado SOLO con el resultado final confirmado (0086): la sugerencia no alcanza", () => {
    const piezas = {
      ...vacias,
      inscripciones: [inscripcion("e1")],
      evaluaciones: [{ id: "a1", cohortId: "coh_e1", name: "Final", required: true }],
      resultados: [{ enrollmentId: "e1", assessmentId: "a1", passed: true }],
    };
    expect(armarCursadasComerciales(piezas)[0]?.aprobacion).toBe("pendiente");
    expect(
      armarCursadasComerciales({ ...piezas, resultadosFinales: [{ enrollmentId: "e1", result: "reprobado" }] })[0]
        ?.aprobacion
    ).toBe("reprobado");
  });

  it("un certificado SUSPENDIDO (sin resultado confirmado) no es vigente; el confirmado aprobado sí", () => {
    const filas = armarCursadasComerciales({
      ...vacias,
      inscripciones: [inscripcion("e1"), inscripcion("e2")],
      certificados: [
        { enrollmentId: "e1", revokedAt: null },
        { enrollmentId: "e2", revokedAt: null },
      ],
      resultadosFinales: [{ enrollmentId: "e2", result: "aprobado" }],
    });
    expect(filas.map((f) => f.certificadoVigente)).toEqual([false, true]);
  });

  it("2026-10-29 — grupo terminado sin la asistencia completa: sin resultado y su certificado no vale", () => {
    const [c] = armarCursadasComerciales({
      ...vacias,
      clases: [{ ...conLista("coh_e1"), tomada: false }],
      inscripciones: [inscripcion("e1")],
      certificados: [{ enrollmentId: "e1", revokedAt: null }],
      resultadosFinales: [{ enrollmentId: "e1", result: "aprobado" }],
    });
    expect(c?.aprobacion).toBe("sin_datos");
    expect(c?.certificadoVigente).toBe(false);
  });

  it("calcula la aprobación de cada cursada con la regla del legajo", () => {
    const [c] = armarCursadasComerciales({
      ...vacias,
      resultadosFinales: [{ enrollmentId: "e1", result: "aprobado" }],
      inscripciones: [inscripcion("e1")],
      clases: [
        { id: "s1", cohortId: "coh_e1", date: new Date("2025-03-02T00:00:00Z"), endTime: "21:00", canceledAt: null, tomada: true },
        { id: "s2", cohortId: "coh_e1", date: new Date("2025-03-03T00:00:00Z"), endTime: "21:00", canceledAt: null, tomada: true },
      ],
      asistencias: [
        { enrollmentId: "e1", classSessionId: "s1", status: "presente" },
        { enrollmentId: "e1", classSessionId: "s2", status: "presente" },
      ],
      evaluaciones: [{ id: "a1", cohortId: "coh_e1", name: "Final", required: true }],
      resultados: [{ enrollmentId: "e1", assessmentId: "a1", passed: true }],
    });
    expect(c).toMatchObject({
      enrollmentId: "e1",
      courseId: "crs_arq",
      aprobacion: "aprobado",
      nuncaDictada: false,
      certificadoVigente: false,
      cohortName: "Marzo",
    });
  });

  it("sin marcas ni evaluaciones = sin_datos (no aprobado por defecto)", () => {
    const [c] = armarCursadasComerciales({ ...vacias, inscripciones: [inscripcion("e1")] });
    expect(c?.aprobacion).toBe("sin_datos");
  });

  it("no mezcla las marcas de otra persona del mismo grupo", () => {
    const [c] = armarCursadasComerciales({
      ...vacias,
      inscripciones: [inscripcion("e1", { cohortId: "g" })],
      clases: [{ id: "s1", cohortId: "g", date: new Date("2025-03-02T00:00:00Z"), endTime: "21:00", canceledAt: null, tomada: true }],
      asistencias: [{ enrollmentId: "otra", classSessionId: "s1", status: "presente" }],
    });
    expect(c?.aprobacion).toBe("sin_datos");
  });

  it("marca las no dictadas desde el set de `inscripcionesNoDictadas`", () => {
    const filas = armarCursadasComerciales({
      ...vacias,
      inscripciones: [inscripcion("e1"), inscripcion("e2")],
      noDictadas: new Set(["e2"]),
    });
    expect(filas.map((f) => [f.enrollmentId, f.nuncaDictada])).toEqual([
      ["e1", false],
      ["e2", true],
    ]);
  });

  it("certificado revocado no es vigente; sin revocar, sí", () => {
    const filas = armarCursadasComerciales({
      ...vacias,
      inscripciones: [inscripcion("e1"), inscripcion("e2")],
      certificados: [
        { enrollmentId: "e1", revokedAt: new Date("2025-06-01") },
        { enrollmentId: "e2", revokedAt: null },
      ],
      resultadosFinales: [
        { enrollmentId: "e1", result: "aprobado" },
        { enrollmentId: "e2", result: "aprobado" },
      ],
    });
    expect(filas.map((f) => f.certificadoVigente)).toEqual([false, true]);
  });

  it("pasa la madre de la especialización a las hijas", () => {
    const filas = armarCursadasComerciales({
      ...vacias,
      inscripciones: [inscripcion("madre"), inscripcion("hija", { parent: "madre" })],
    });
    expect(filas[1]?.parentEnrollmentId).toBe("madre");
  });
});

describe("armarCursadasComerciales — la venta (046 US8)", () => {
  it("pasa el vendedor y la empresa de la inscripción", () => {
    const base = inscripcion("e1");
    const [c] = armarCursadasComerciales({
      ...vacias,
      inscripciones: [{ ...base, enrollment: { ...base.enrollment, sellerId: "sel_1", companyId: "emp_1" } }],
    });
    expect(c).toMatchObject({ sellerId: "sel_1", companyId: "emp_1" });
  });
});
