import { describe, expect, it, vi } from "vitest";

/**
 * 046 (T004; FR-001, research R2) — La aprobación de UNA cursada, extraída del
 * legajo para que el recorrido comercial la use sin copiarla.
 *
 * La función no lee la base: recibe las piezas ya filtradas. `@/lib/db` se
 * simula solo porque el módulo vive en `src/server` junto a otros que la importan.
 */

vi.mock("@/lib/db", () => ({ getDb: () => ({}), schema: {} }));

const { estadoDeAprobacionDeCursada } = await import("@/server/estado-de-cursada");

const reloj = { timeZone: "America/Montevideo", now: new Date("2026-10-23T12:00:00Z") };
/** Sin fechas el grupo no está "terminado": no aplica la regla de grupo completo. */
const SIN_FECHAS = { startDate: null, endDate: null };
const sinDispensa = {
  attendanceWaiverAt: null,
  attendanceWaiverReason: null,
  attendanceWaiverRevokedAt: null,
};

function clase(id: string, dia: string, tomada = true) {
  return { id, date: new Date(`${dia}T00:00:00Z`), endTime: "21:00", canceledAt: null, tomada };
}

describe("estadoDeAprobacionDeCursada", () => {
  it("sin marcas propias ni obligatorias → asistencia null y sin_datos (no es 0%)", () => {
    const r = estadoDeAprobacionDeCursada(
      { enrolledAt: null, ...sinDispensa, waiverAuthorName: null, cohortMinPct: 75, courseMinPct: null, resultadoConfirmado: null, grupo: SIN_FECHAS },
      { clases: [clase("c1", "2026-09-01")], asistencias: [], evaluaciones: [], resultados: [], reloj }
    );
    expect(r.attendancePct).toBeNull();
    expect(r.state).toBe("sin_datos");
  });

  it("una obligatoria desaprobada reprueba aunque la asistencia esté bien", () => {
    const r = estadoDeAprobacionDeCursada(
      { enrolledAt: null, ...sinDispensa, waiverAuthorName: null, cohortMinPct: 50, courseMinPct: null, resultadoConfirmado: null, grupo: SIN_FECHAS },
      {
        clases: [clase("c1", "2026-09-01"), clase("c2", "2026-09-02")],
        asistencias: [
          { classSessionId: "c1", status: "presente" },
          { classSessionId: "c2", status: "presente" },
        ],
        evaluaciones: [
          { id: "a1", name: "Final", required: true },
          { id: "a2", name: "Opcional", required: false },
        ],
        resultados: [{ assessmentId: "a1", passed: false }],
        reloj,
      }
    );
    expect(r.attendancePct).toBe(100);
    expect(r.sugerencia.state).toBe("reprobado");
    expect(r.assessments).toEqual([
      { name: "Final", passed: false, required: true },
      { name: "Opcional", passed: null, required: false },
    ]);
  });

  it("el mínimo del grupo gana al del curso; sin el del grupo, hereda", () => {
    const piezas = {
      clases: [clase("c1", "2026-09-01"), clase("c2", "2026-09-02")],
      asistencias: [
        { classSessionId: "c1", status: "presente" as const },
        { classSessionId: "c2", status: "ausente" as const },
      ],
      evaluaciones: [],
      resultados: [],
      reloj,
    };
    const conGrupo = estadoDeAprobacionDeCursada(
      { enrolledAt: null, ...sinDispensa, waiverAuthorName: null, cohortMinPct: 40, courseMinPct: 80, resultadoConfirmado: null, grupo: SIN_FECHAS },
      piezas
    );
    expect(conGrupo.minAttendancePct).toBe(40);
    expect(conGrupo.sugerencia.state).toBe("aprobado");
    const heredado = estadoDeAprobacionDeCursada(
      { enrolledAt: null, ...sinDispensa, waiverAuthorName: null, cohortMinPct: null, courseMinPct: 80, resultadoConfirmado: null, grupo: SIN_FECHAS },
      piezas
    );
    expect(heredado.minAttendancePct).toBe(80);
    expect(heredado.sugerencia.state).toBe("reprobado");
  });

  it("la dispensa vigente saltea solo la asistencia", () => {
    const r = estadoDeAprobacionDeCursada(
      {
        enrolledAt: null,
        attendanceWaiverAt: new Date("2026-09-10"),
        attendanceWaiverReason: "Viaje de trabajo",
        attendanceWaiverRevokedAt: null,
        waiverAuthorName: "Coordinación",
        cohortMinPct: 80,
        courseMinPct: null,
        resultadoConfirmado: null, grupo: SIN_FECHAS,
      },
      {
        clases: [clase("c1", "2026-09-01"), clase("c2", "2026-09-02")],
        asistencias: [
          { classSessionId: "c1", status: "presente" },
          { classSessionId: "c2", status: "ausente" },
        ],
        evaluaciones: [{ id: "a1", name: "Final", required: true }],
        resultados: [{ assessmentId: "a1", passed: true }],
        reloj,
      }
    );
    expect(r.dispensa).not.toBeNull();
    expect(r.attendancePct).toBe(50);
    expect(r.sugerencia.state).toBe("aprobado");
  });
});

describe("0086 — lo afirmado es el resultado final CONFIRMADO", () => {
  const piezas = {
    clases: [clase("c1", "2026-09-01")],
    asistencias: [{ classSessionId: "c1", status: "presente" as const }],
    evaluaciones: [{ id: "a1", name: "Final", required: true }],
    resultados: [{ assessmentId: "a1", passed: true }],
    reloj,
  };
  const base = { enrolledAt: null, ...sinDispensa, waiverAuthorName: null, cohortMinPct: 75, courseMinPct: null };

  it("sugerencia aprobado sin confirmar → pendiente de confirmación", () => {
    const r = estadoDeAprobacionDeCursada({ ...base, resultadoConfirmado: null, grupo: SIN_FECHAS }, piezas);
    expect(r.sugerencia.state).toBe("aprobado");
    expect(r.state).toBe("pendiente");
    expect(r.reasons).toContain("Resultado pendiente de confirmación");
    expect(r.reasons).toContain("Sugerencia del sistema: aprobado");
  });

  it("el profesor puede reprobar aunque la sugerencia sea aprobado", () => {
    const r = estadoDeAprobacionDeCursada({ ...base, resultadoConfirmado: "reprobado", grupo: SIN_FECHAS }, piezas);
    expect(r.state).toBe("reprobado");
    expect(r.reasons).toEqual([]);
  });

  it("y aprobar aunque la sugerencia sea reprobado", () => {
    const r = estadoDeAprobacionDeCursada(
      { ...base, resultadoConfirmado: "aprobado", grupo: SIN_FECHAS },
      { ...piezas, resultados: [{ assessmentId: "a1", passed: false }] }
    );
    expect(r.sugerencia.state).toBe("reprobado");
    expect(r.state).toBe("aprobado");
  });
});

describe("2026-10-29 — grupo terminado sin la asistencia completa: sin resultado", () => {
  const base = {
    enrolledAt: null,
    ...sinDispensa,
    waiverAuthorName: null,
    cohortMinPct: 75,
    courseMinPct: null,
    grupo: { startDate: new Date("2026-08-01T00:00:00Z"), endDate: new Date("2026-09-30T00:00:00Z") },
  };
  const piezas = (tomada: boolean) => ({
    clases: [clase("c1", "2026-09-01", true), clase("c2", "2026-09-08", tomada)],
    asistencias: [{ classSessionId: "c1", status: "presente" as const }],
    evaluaciones: [{ id: "a1", name: "Final", required: true }],
    resultados: [{ assessmentId: "a1", passed: true }],
    reloj,
  });

  it("una clase dictada sin lista: sin_datos, aunque haya un aprobado confirmado", () => {
    const r = estadoDeAprobacionDeCursada({ ...base, resultadoConfirmado: "aprobado" }, piezas(false));
    expect(r.sinResultado).toBe(true);
    expect(r.state).toBe("sin_datos");
  });

  it("completo: lo confirmado vale", () => {
    const r = estadoDeAprobacionDeCursada({ ...base, resultadoConfirmado: "aprobado" }, piezas(true));
    expect(r.sinResultado).toBe(false);
    expect(r.state).toBe("aprobado");
  });
});
