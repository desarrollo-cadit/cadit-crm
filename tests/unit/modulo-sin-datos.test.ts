import { describe, expect, it } from "vitest";
import {
  approvalState,
  estadoDeModulo,
  moduleApprovalState,
  programApprovalState,
  type DispensaDeAsistencia,
} from "@/server/grading";
import { estadoDeCelda } from "@/lib/recorrido";

/**
 * 030 — Un módulo SIN datos no está aprobado.
 *
 * `approvalState([], null, null)` devuelve `aprobado`, y en la planilla de la
 * cohorte está bien: el coordinador sabe que todavía no cargó nada. En el
 * recorrido de una especialización NO: la grilla lo leía como "aprobó este
 * módulo" y el certificado general podía quedar como certificable sin un solo
 * dato cargado. Es la misma trampa que en el legajo (013) hizo existir
 * `sin_datos`, y se resuelve con el mismo nombre.
 */

const DISPENSA: DispensaDeAsistencia = {
  otorgadaEl: new Date("2026-09-01T12:00:00Z"),
  otorgadaPor: "Coordinación",
  motivo: "Certificado médico",
};

describe("estadoDeModulo — sin evaluaciones obligatorias NI asistencia", () => {
  it("sin datos de ninguna clase dice sin_datos, no aprobado", () => {
    const r = estadoDeModulo([], null, null, null);
    expect(r.state).toBe("sin_datos");
    expect(r.reasons.join(" ")).toMatch(/evaluaciones.*asistencia/);
  });

  it("con mínimo de asistencia exigido y sin lista tomada, también sin_datos", () => {
    expect(estadoDeModulo([], null, 80, null).state).toBe("sin_datos");
  });

  it("con dispensa pero sin un solo dato, sigue sin_datos: la dispensa perdona faltas, no inventa notas", () => {
    expect(estadoDeModulo([], null, 80, DISPENSA).state).toBe("sin_datos");
  });

  it("sólo asistencia: la regla de siempre", () => {
    expect(estadoDeModulo([], 90, 80, null)).toEqual(moduleApprovalState([], 90, 80, null));
    expect(estadoDeModulo([], 50, 80, null).state).toBe("reprobado");
    expect(estadoDeModulo([], 90, null, null).state).toBe("aprobado");
  });

  it("sólo evaluación obligatoria: la regla de siempre", () => {
    expect(estadoDeModulo([true], null, null, null).state).toBe("aprobado");
    expect(estadoDeModulo([null], null, null, null).state).toBe("pendiente");
    expect(estadoDeModulo([false], null, null, null).state).toBe("reprobado");
  });

  it("la dispensa, con datos, se comporta exactamente igual que antes", () => {
    for (const [r, pct, min] of [
      [[true], 62, 80],
      [[true, false], 62, 80],
      [[true], null, 80],
      [[true], 90, 80],
    ] as const) {
      expect(estadoDeModulo([...r], pct, min, DISPENSA)).toEqual(
        moduleApprovalState([...r], pct, min, DISPENSA)
      );
    }
  });

  it("la planilla de la cohorte NO cambia: el default optimista sigue ahí", () => {
    expect(approvalState([], null, null).state).toBe("aprobado");
    expect(moduleApprovalState([], null, null, null).state).toBe("aprobado");
  });
});

describe("programApprovalState — un módulo sin_datos no deja certificar", () => {
  it("aprobado + sin_datos → pendiente, y la razón dice que falta el dato", () => {
    const r = programApprovalState(["aprobado", "sin_datos"]);
    expect(r.state).toBe("pendiente");
    expect(r.reasons.join(" ")).toContain("sin datos");
  });

  it("reprobado gana sobre sin_datos", () => {
    expect(programApprovalState(["reprobado", "sin_datos"]).state).toBe("reprobado");
  });

  it("todos sin_datos jamás es aprobado", () => {
    expect(programApprovalState(["sin_datos", "sin_datos"]).state).toBe("pendiente");
  });
});

describe("estadoDeCelda — la celda sin datos", () => {
  const columna = {
    cohortId: "m2",
    courseId: "crs_mep",
    startDate: "2026-05-01T00:00:00.000Z",
    endDate: "2026-06-30T00:00:00.000Z",
  };

  it("dice «Sin datos» con palabras, neutra, y explica por qué", () => {
    const c = estadoDeCelda(
      [
        {
          cohortId: "m2",
          courseId: "crs_mep",
          state: "sin_datos",
          reasons: [],
          attendancePct: null,
          minAttendancePct: null,
          dispensada: false,
          otraCamada: false,
          camadaName: null,
        },
      ],
      columna,
      new Date("2026-07-10T00:00:00Z")
    );
    expect(c.kind).toBe("sin_datos");
    expect(c.label).toBe("Sin datos");
    expect(c.variant).toBe("outline");
    expect(c.title).toContain("Nadie cargó");
  });
});
