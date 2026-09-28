import { describe, expect, it } from "vitest";
import { estadoDeCelda, type IntentoDeModulo } from "@/lib/recorrido";

/**
 * 029 — La celda del tablero de Recorrido: alumno × módulo.
 *
 * Una sola función decide qué dice cada celda, y la dice con PALABRAS: el
 * color acompaña, nunca es la única señal (quien no distingue verde de rojo
 * tiene que poder leer la grilla igual).
 */

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const columna = {
  cohortId: "m2",
  courseId: "crs_mep",
  startDate: "2026-05-01T00:00:00.000Z",
  endDate: "2026-06-30T00:00:00.000Z",
};

function intento(p: Partial<IntentoDeModulo> = {}): IntentoDeModulo {
  return {
    cohortId: "m2",
    courseId: "crs_mep",
    state: "pendiente",
    reasons: [],
    attendancePct: 80,
    minAttendancePct: 75,
    dispensada: false,
    otraCamada: false,
    camadaName: null,
    ...p,
  };
}

describe("estadoDeCelda", () => {
  it("sin cursada: la celda lo dice y no enlaza", () => {
    const c = estadoDeCelda([], columna, d("2026-05-10"));
    expect(c.kind).toBe("sin_cursada");
    expect(c.href).toBeNull();
  });

  it("aprobado y reprobado se dicen tal cual", () => {
    expect(estadoDeCelda([intento({ state: "aprobado" })], columna, d("2026-07-10")).label).toBe(
      "Aprobado"
    );
    expect(estadoDeCelda([intento({ state: "reprobado" })], columna, d("2026-07-10")).kind).toBe(
      "reprobado"
    );
  });

  it("pendiente dentro de las fechas del módulo es CURSANDO", () => {
    const c = estadoDeCelda([intento()], columna, d("2026-05-10"));
    expect(c.kind).toBe("cursando");
    expect(c.label).toBe("Cursando");
  });

  it("pendiente antes de que empiece sigue siendo pendiente", () => {
    expect(estadoDeCelda([intento()], columna, d("2026-04-01")).kind).toBe("pendiente");
  });

  it("baja voluntaria: nombra la camada a la que se mudó", () => {
    const c = estadoDeCelda(
      [intento({ cohortId: "m2_ebim14", otraCamada: true, camadaName: "EBIM 14" })],
      columna,
      d("2026-05-10")
    );
    expect(c.kind).toBe("baja");
    expect(c.label).toBe("Baja → EBIM 14");
    expect(c.href).toBe("/cohorts/m2_ebim14");
  });

  it("recursa: dos intentos del mismo módulo, el vigente en otra camada", () => {
    const c = estadoDeCelda(
      [
        intento({ state: "reprobado" }),
        intento({ cohortId: "m2_ebim14", otraCamada: true, camadaName: "EBIM 14" }),
      ],
      columna,
      d("2026-05-10")
    );
    expect(c.kind).toBe("recursa");
    expect(c.label).toBe("Recursa en EBIM 14");
  });

  it("recursó y aprobó: aprobado, diciendo que fue recursando", () => {
    const c = estadoDeCelda(
      [intento({ state: "reprobado" }), intento({ state: "aprobado", otraCamada: true })],
      columna,
      d("2026-09-10")
    );
    expect(c.kind).toBe("aprobado");
    expect(c.label).toBe("Aprobado (recursó)");
  });

  it("el título lleva asistencia real, mínimo, dispensa y motivos", () => {
    const c = estadoDeCelda(
      [intento({ attendancePct: 60, dispensada: true, reasons: ["Parcial: pendiente"] })],
      columna,
      d("2026-05-10")
    );
    expect(c.title).toContain("Asistencia: 60% (mínimo 75%)");
    expect(c.title).toContain("con dispensa");
    expect(c.title).toContain("Parcial: pendiente");
  });

  it("asistencia sin datos no se escribe como 0%", () => {
    const c = estadoDeCelda([intento({ attendancePct: null })], columna, d("2026-05-10"));
    expect(c.title).toContain("Asistencia: sin datos");
    expect(c.title).not.toContain("0%");
  });
});
