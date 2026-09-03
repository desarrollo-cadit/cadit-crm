import { describe, expect, it } from "vitest";
import { exportCompanyReportCsv, type CompanyReportDto } from "@/server/company-report";

/**
 * 013 (T032, FR-010c) — El CSV que se le manda a la empresa.
 *
 * Este archivo sale de la academia y lo abre alguien de AFUERA. La protección
 * anti-inyección de fórmulas importa más acá que en el export interno: el
 * nombre de un alumno puede haber entrado por un formulario público sin
 * autenticar, y Excel ejecuta una celda que arranca con `=`, `+`, `-` o `@`.
 */

function reporte(rows: CompanyReportDto["rows"]): CompanyReportDto {
  return { company: { id: "cia_1", name: "Constructora S.A." }, rows };
}

const fila = (over: Partial<CompanyReportDto["rows"][number]> = {}) => ({
  employeeName: "Ana Pérez",
  email: "ana@x.com",
  cohortName: "Revit MEP 2",
  courseName: "Revit MEP",
  attendancePct: 90,
  minAttendancePct: 75,
  approval: "aprobado" as const,
  certificateCode: "ABCD-EFGH-IJKL",
  ...over,
});

describe("exportCompanyReportCsv — el archivo que sale de la academia", () => {
  it("arma encabezado y una línea por empleado", () => {
    const csv = exportCompanyReportCsv(reporte([fila(), fila({ employeeName: "Luis Gómez" })]));
    const lineas = csv.split("\n");
    expect(lineas[0]).toContain("Empleado");
    expect(lineas).toHaveLength(3);
    expect(lineas[1]).toContain("Ana Pérez");
    expect(lineas[2]).toContain("Luis Gómez");
  });

  /**
   * **El caso que justifica el test.** Un nombre que arranca con `=` se
   * ejecuta al abrir el archivo. El apóstrofo inicial hace que la planilla lo
   * trate como texto.
   */
  it.each([
    "=HYPERLINK(\"http://malo\",\"click\")",
    "+1+1",
    "-2+3",
    "@SUM(A1:A9)",
  ])("neutraliza una fórmula en el nombre: %s", (nombre) => {
    const csv = exportCompanyReportCsv(reporte([fila({ employeeName: nombre })]));
    const linea = csv.split("\n")[1]!;
    // Queda como texto: precedido por apóstrofo, nunca crudo al inicio de celda.
    expect(linea.startsWith(nombre)).toBe(false);
    expect(linea).toContain("'");
  });

  it("entrecomilla los campos con coma, sin romper la columna", () => {
    const csv = exportCompanyReportCsv(
      reporte([fila({ employeeName: "Pérez, Ana" })])
    );
    expect(csv.split("\n")[1]).toContain('"Pérez, Ana"');
  });

  it("escapa las comillas duplicándolas (RFC 4180)", () => {
    const csv = exportCompanyReportCsv(
      reporte([fila({ employeeName: 'Ana "La Jefa" Pérez' })])
    );
    expect(csv.split("\n")[1]).toContain('"Ana ""La Jefa"" Pérez"');
  });

  /**
   * **El reporte NO lleva montos.** Lo que la empresa pagó es entre la empresa
   * y la academia; no va en la misma planilla que las notas de sus empleados.
   */
  it("no expone ningún dato financiero", () => {
    const csv = exportCompanyReportCsv(reporte([fila()]));
    for (const palabra of ["monto", "saldo", "cuota", "pago", "precio", "factura"]) {
      expect(csv.toLowerCase()).not.toContain(palabra);
    }
  });

  it("los valores ausentes quedan vacíos, no como «null»", () => {
    const csv = exportCompanyReportCsv(
      reporte([
        fila({ email: null, attendancePct: null, minAttendancePct: null, certificateCode: null }),
      ])
    );
    const linea = csv.split("\n")[1]!;
    expect(linea).not.toContain("null");
    expect(linea).toContain(",,");
  });

  it("una empresa sin empleados devuelve solo el encabezado", () => {
    const csv = exportCompanyReportCsv(reporte([]));
    expect(csv.split("\n")).toHaveLength(1);
  });

  it("traduce el estado a algo legible para quien lo recibe", () => {
    const csv = exportCompanyReportCsv(reporte([fila({ approval: "sin_datos" })]));
    expect(csv).toContain("Sin datos");
    expect(csv).not.toContain("sin_datos");
  });
});
