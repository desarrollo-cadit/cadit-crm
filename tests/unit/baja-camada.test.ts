import { describe, expect, it } from "vitest";
import { decidirBajaCamada } from "@/server/courses";

/**
 * 023 — Qué se puede borrar y qué no.
 *
 * Es la regla que decide si se destruye historia de personas reales, y por eso
 * es pura y se prueba sin base. El caso que la fase vino a resolver es el
 * inofensivo —crear una camada por error y no poder sacarla, porque la ruta
 * DELETE no existía— pero la puerta que abre da a las otras 41.
 *
 * 2026-10-22 — Un grupo que no salió (sin confirmar en su fecha) se borra con
 * sus clases SIN historia: el cronograma generado no es historia de nadie. Las
 * clases con asistencia o grabación, las evaluaciones con resultados y las
 * inscripciones siguen bloqueando.
 */

const vacia = {
  enrollments: 0,
  classesWithHistory: 0,
  classesWithoutHistory: 0,
  attendance: 0,
  assessmentsWithResults: 0,
  payments: 0,
  modules: 0,
};

describe("023 — baja de una camada", () => {
  it("una camada vacía se borra", () => {
    const d = decidirBajaCamada(vacia);
    expect(d.accion).toBe("borrar");
    expect(d.motivo).toContain("se puede borrar");
  });

  it("las clases SIN historia ya no bloquean: se borran con el grupo, y se dice cuántas", () => {
    const d = decidirBajaCamada({ ...vacia, classesWithoutHistory: 12 });
    expect(d.accion).toBe("borrar");
    expect(d.motivo).toContain("12 clases sin asistencia");
  });

  /**
   * Cada uno de estos, POR SÍ SOLO, alcanza para bloquear. Se prueban de a uno
   * porque el error que importa no es "no detecta nada": es "detecta cuatro de
   * cinco", y ese pasa desapercibido hasta que alguien borra la quinta.
   */
  it.each([
    ["inscripciones", { ...vacia, enrollments: 1 }],
    ["clases con historia", { ...vacia, classesWithHistory: 1 }],
    ["asistencia", { ...vacia, attendance: 1 }],
    ["evaluaciones con resultados", { ...vacia, assessmentsWithResults: 1 }],
    ["pagos", { ...vacia, payments: 1 }],
    ["módulos", { ...vacia, modules: 1 }],
  ])("con %s, se bloquea", (_que, historial) => {
    expect(decidirBajaCamada(historial).accion).toBe("bloquear");
  });

  /**
   * El motivo dice QUÉ la ata y CÓMO salir: un mensaje que no dice cómo salir
   * obliga a abrir la base para averiguarlo.
   */
  it("con inscriptos: el número y la salida", () => {
    const d = decidirBajaCamada({ ...vacia, enrollments: 4 });
    expect(d.motivo).toContain("Tiene 4 inscriptos: mudalos a otro grupo o cancelá sus inscripciones.");
  });

  it("con clases con historia, evaluaciones con resultados y módulos: cada uno con su número", () => {
    const d = decidirBajaCamada({
      ...vacia,
      classesWithHistory: 3,
      assessmentsWithResults: 2,
      modules: 5,
    });
    expect(d.motivo).toContain("3 clases con asistencia o grabación");
    expect(d.motivo).toContain("2 evaluaciones con resultados");
    expect(d.motivo).toContain("5 módulos");
  });

  it("nombra todo lo que la ata a la vez", () => {
    const d = decidirBajaCamada({ ...vacia, enrollments: 3, payments: 2 });
    expect(d.motivo).toContain("3 inscriptos");
    expect(d.motivo).toContain("2 pagos");
  });

  /** Singular y plural: el mensaje lo lee una persona, no un log. */
  it("concuerda en singular", () => {
    const d = decidirBajaCamada({ ...vacia, enrollments: 1, classesWithHistory: 1 });
    expect(d.motivo).toContain("1 inscripto:");
    expect(d.motivo).toContain("1 clase con asistencia");
    expect(d.motivo).not.toContain("1 inscriptos");
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
