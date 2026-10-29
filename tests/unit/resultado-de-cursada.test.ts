import { describe, expect, it } from "vitest";
import {
  ETIQUETA_DE_RESULTADO,
  resultadoDeCursada,
  textoDeAsistencia,
} from "@/lib/resultado-de-cursada";
import { filaDeReporte, exportCompanyReportCsv } from "@/server/company-report";

/**
 * 2026-10-29 — Bug de producción: en `/empresas`, un alumno de un grupo EN
 * CURSO, sin evaluaciones obligatorias y con buena asistencia, figuraba
 * "Aprobado". La pantalla, el CSV y la constancia en PDF deciden ahora con
 * `resultadoDeCursada`, y nunca hay aprobación sin la confirmación del
 * profesor.
 */

describe("resultadoDeCursada — la regla compartida", () => {
  it("en curso nunca es aprobado, aunque haya un resultado cargado", () => {
    expect(resultadoDeCursada({ estadoDelGrupo: "en_curso", resultadoConfirmado: null })).toBe("en_curso");
    expect(resultadoDeCursada({ estadoDelGrupo: "en_curso", resultadoConfirmado: "aprobado" })).toBe("en_curso");
  });
  it("por comenzar", () => {
    expect(resultadoDeCursada({ estadoDelGrupo: "planificada", resultadoConfirmado: null })).toBe("por_comenzar");
  });
  it("terminado: solo con confirmación del profesor", () => {
    expect(resultadoDeCursada({ estadoDelGrupo: "finalizada", resultadoConfirmado: null })).toBe("pendiente");
    expect(resultadoDeCursada({ estadoDelGrupo: "finalizada", resultadoConfirmado: "aprobado" })).toBe("aprobado");
    expect(resultadoDeCursada({ estadoDelGrupo: "finalizada", resultadoConfirmado: "reprobado" })).toBe("reprobado");
  });
  it("sin grupo no se puede decir nada", () => {
    expect(resultadoDeCursada({ estadoDelGrupo: null, resultadoConfirmado: null })).toBe("sin_datos");
  });
  it("etiquetas", () => {
    expect(ETIQUETA_DE_RESULTADO.pendiente).toBe("Resultado pendiente");
    expect(ETIQUETA_DE_RESULTADO.en_curso).toBe("En curso");
  });
});

describe("textoDeAsistencia", () => {
  it("X de Y clases (Z%), con «hasta hoy» en curso", () => {
    expect(textoDeAsistencia({ presentes: 8, cuentan: 10, pct: 80 }, false)).toBe("8 de 10 clases (80%)");
    expect(textoDeAsistencia({ presentes: 1, cuentan: 1, pct: 100 }, true)).toBe("1 de 1 clase (100%) hasta hoy");
    expect(textoDeAsistencia({ presentes: 0, cuentan: 0, pct: null }, true)).toBeNull();
  });
});

describe("filaDeReporte — el bug de /empresas", () => {
  const TZ = "America/Montevideo";
  const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const fechas = ["2026-10-05", "2026-10-07", "2026-10-09", "2026-10-12"];
  const base = {
    employeeName: "Ana Pérez",
    email: null,
    cohort: { name: "Revit 6", startDate: dia("2026-10-05"), endDate: dia("2026-11-30") },
    courseName: "Revit",
    enrolledAt: dia("2026-09-01"),
    clases: fechas.map((f) => ({ id: f, date: dia(f), endTime: "21:00", canceledAt: null, tomada: true })),
    marcas: fechas.map((f) => ({ classSessionId: f, status: "presente" as const })),
    minAttendancePct: 75,
    resultadoConfirmado: null,
    certificateCode: null,
    reloj: { timeZone: TZ, now: new Date("2026-10-20T12:00:00.000Z") },
  };

  it("grupo en curso, asistencia completa y sin evaluaciones: NO es aprobado", () => {
    const fila = filaDeReporte(base);
    expect(fila.approval).toBe("en_curso");
    expect(fila.cohortStatus).toBe("en_curso");
    expect(fila.attendanceText).toBe("4 de 4 clases (100%) hasta hoy");
    expect(exportCompanyReportCsv({ company: { id: "c", name: "X" }, rows: [fila] })).not.toContain("Aprobado");
  });

  it("grupo terminado sin confirmación: resultado pendiente", () => {
    const fila = filaDeReporte({ ...base, reloj: { timeZone: TZ, now: new Date("2026-12-15T12:00:00.000Z") } });
    expect(fila.approval).toBe("pendiente");
    expect(fila.attendanceText).toBe("4 de 4 clases (100%)");
  });

  it("sin grupo: sin datos", () => {
    const fila = filaDeReporte({ ...base, cohort: null });
    expect(fila.approval).toBe("sin_datos");
    expect(fila.cohortName).toBe("Revit");
    expect(fila.attendanceText).toBeNull();
  });
});
