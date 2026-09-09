import { describe, expect, it } from "vitest";
import { decidirBajaCamada } from "@/server/courses";

/**
 * 023 — Qué se puede borrar y qué no.
 *
 * Es la regla que decide si se destruye historia de personas reales, y por eso
 * es pura y se prueba sin base. El caso que la fase vino a resolver es el
 * inofensivo —crear una camada por error y no poder sacarla, porque la ruta
 * DELETE no existía— pero la puerta que abre da a las otras 41.
 */

const vacia = {
  enrollments: 0,
  classes: 0,
  attendance: 0,
  assessments: 0,
  payments: 0,
};

describe("023 — baja de una camada", () => {
  it("una camada vacía se borra", () => {
    const d = decidirBajaCamada(vacia);
    expect(d.accion).toBe("borrar");
    expect(d.motivo).toContain("se puede borrar");
  });

  /**
   * Cada uno de estos, POR SÍ SOLO, alcanza para bloquear. Se prueban de a uno
   * porque el error que importa no es "no detecta nada": es "detecta cuatro de
   * cinco", y ese pasa desapercibido hasta que alguien borra la quinta.
   */
  it.each([
    ["inscripciones", { ...vacia, enrollments: 1 }],
    ["clases", { ...vacia, classes: 1 }],
    ["asistencia", { ...vacia, attendance: 1 }],
    ["evaluaciones", { ...vacia, assessments: 1 }],
    ["pagos", { ...vacia, payments: 1 }],
  ])("con %s, se bloquea", (_que, historial) => {
    expect(decidirBajaCamada(historial).accion).toBe("bloquear");
  });

  /**
   * El motivo dice QUÉ la ata, no "no se puede". Un mensaje que no dice cómo
   * salir obliga a abrir la base para averiguarlo.
   */
  it("el motivo nombra lo que la ata", () => {
    const d = decidirBajaCamada({ ...vacia, enrollments: 3, payments: 2 });
    expect(d.motivo).toContain("3 inscripciones");
    expect(d.motivo).toContain("2 pagos");
  });

  it("y ofrece las dos salidas: finalizarla o sacarle las inscripciones", () => {
    const d = decidirBajaCamada({ ...vacia, enrollments: 1 });
    expect(d.motivo).toContain("finalizada");
    expect(d.motivo).toContain("inscripciones");
  });

  /** Singular y plural: el mensaje lo lee una persona, no un log. */
  it("concuerda en singular", () => {
    const d = decidirBajaCamada({ ...vacia, enrollments: 1, classes: 1 });
    expect(d.motivo).toContain("1 inscripción");
    expect(d.motivo).toContain("1 clase");
    expect(d.motivo).not.toContain("1 inscripciones");
  });

  /**
   * Una camada se BLOQUEA, no se archiva — a diferencia de un contacto (014).
   * Un contacto archivado sigue siendo una persona con historial propio; una
   * "camada archivada" con inscripciones adentro sería una lista que nadie
   * mira pero que sigue apareciendo en el legajo de cada alumno. El estado
   * `finalizada` ya cubre "esto terminó".
   */
  it("nunca propone archivar: ese camino es el del contacto, no el de la camada", () => {
    const acciones = [
      decidirBajaCamada(vacia).accion,
      decidirBajaCamada({ ...vacia, enrollments: 5 }).accion,
    ];
    expect(acciones).not.toContain("archivar");
  });
});
