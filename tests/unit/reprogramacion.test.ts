import { describe, expect, it } from "vitest";
import { planDeReprogramacion, type DatosDeReprogramacion } from "@/lib/reprogramacion";

/**
 * "Reprogramar" un grupo que no salió en su fecha: fechas nuevas, mismas
 * días y horario. Las clases SIN historia se borran y el cronograma se
 * regenera (si lo tenía); las inscripciones quedan. Una clase con asistencia
 * o grabación bloquea: eso ya es cursada.
 */

const sinHistoria = { tieneAsistencia: false, tieneGrabacion: false };
const base: DatosDeReprogramacion = {
  esEspecializacion: false,
  inicioActual: new Date("2026-11-10T00:00:00.000Z"),
  nuevoInicio: new Date("2026-12-01T00:00:00.000Z"),
  nuevoFin: new Date("2027-02-15T00:00:00.000Z"),
  diasDeCursada: "0,2",
  clases: [sinHistoria, sinHistoria, sinHistoria],
  clasesNuevas: 18,
};

describe("plan de reprogramación", () => {
  it("con cronograma sin historia: borra y regenera, y lo dice con números y fecha", () => {
    const p = planDeReprogramacion(base);
    expect(p).toEqual({
      accion: "reprogramar",
      clasesABorrar: 3,
      regenera: true,
      clasesNuevas: 18,
      mensaje: "Se borran 3 clases sin asistencia y se generan de nuevo desde el 01/12/2026 (18 clases).",
    });
  });

  it("singular", () => {
    const p = planDeReprogramacion({ ...base, clases: [sinHistoria], clasesNuevas: 1 });
    expect(p.accion === "reprogramar" && p.mensaje).toBe(
      "Se borra 1 clase sin asistencia y se genera de nuevo desde el 01/12/2026 (1 clase)."
    );
  });

  it("sin cronograma: solo cambian las fechas, no se genera nada", () => {
    const p = planDeReprogramacion({ ...base, clases: [], diasDeCursada: null, nuevoFin: null, clasesNuevas: 0 });
    expect(p).toMatchObject({ accion: "reprogramar", clasesABorrar: 0, regenera: false });
    expect(p.accion === "reprogramar" && p.mensaje).toContain("no tiene clases generadas");
  });

  it("una clase con asistencia o grabación bloquea, con el número y la salida", () => {
    const p = planDeReprogramacion({
      ...base,
      clases: [sinHistoria, { tieneAsistencia: true, tieneGrabacion: false }, { tieneAsistencia: false, tieneGrabacion: true }],
    });
    expect(p.accion).toBe("bloquear");
    if (p.accion !== "bloquear") return;
    expect(p.code).toBe("clases_con_historia");
    expect(p.motivo).toContain("2 clases con asistencia o grabación");
    expect(p.motivo).toContain("Editar grupo");
  });

  it("una especialización no se reprograma desde acá: sus fechas son las de los módulos", () => {
    const p = planDeReprogramacion({ ...base, esEspecializacion: true, clases: [] });
    expect(p).toMatchObject({ accion: "bloquear", code: "especializacion" });
  });

  it("fin antes del inicio → bloquea", () => {
    const p = planDeReprogramacion({ ...base, nuevoFin: new Date("2026-11-30T00:00:00.000Z") });
    expect(p).toMatchObject({ accion: "bloquear", code: "fechas_invalidas" });
  });

  it("la misma fecha de inicio no es reprogramar", () => {
    const p = planDeReprogramacion({ ...base, nuevoInicio: base.inicioActual });
    expect(p).toMatchObject({ accion: "bloquear", code: "misma_fecha" });
  });

  it("si tenía cronograma y las fechas nuevas no producen clases, bloquea ANTES de borrar nada", () => {
    expect(planDeReprogramacion({ ...base, nuevoFin: null })).toMatchObject({
      accion: "bloquear",
      code: "sin_fecha_fin",
    });
    expect(planDeReprogramacion({ ...base, diasDeCursada: null })).toMatchObject({
      accion: "bloquear",
      code: "sin_dias",
    });
    expect(planDeReprogramacion({ ...base, clasesNuevas: 0 })).toMatchObject({
      accion: "bloquear",
      code: "sin_clases",
    });
  });
});
