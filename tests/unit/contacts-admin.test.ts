import { describe, expect, it } from "vitest";
import { decidirBaja } from "@/server/contacts-admin";

/**
 * 014 (T003, DV-008) — La barrera que protege el historial de una persona.
 *
 * El peligro medido, verificado contra la base real:
 *
 *   contact → enrollment → certificate · payment · installment
 *                        → attendance · assessment_result · license
 *
 * Todo en CASCADE. Un botón de borrar destruiría el historial académico y
 * financiero completo, **incluidos los certificados emitidos**, sin aviso y
 * sin vuelta atrás.
 *
 * Por eso la decisión vive en una función PURA y probada, del lado del
 * servidor. Un diálogo de confirmación en el navegador es un cartel, no una
 * barrera: no protege de un script, de un bug ni de un click apurado.
 */

describe("decidirBaja — borrar solo a quien no tiene nada que perder", () => {
  /**
   * Un contacto sin ninguna inscripción es un lead que nunca cursó, o un error
   * de carga. No hay historial que proteger.
   */
  it("sin inscripciones: se BORRA de verdad", () => {
    const r = decidirBaja({ enrollments: 0, certificates: 0, payments: 0 });
    expect(r.accion).toBe("borrar");
  });

  /**
   * **El caso que justifica el archivo.** Con historial no se borra: se
   * archiva. Un certificado emitido es un documento — borrarlo no corrige un
   * error, borra la prueba de que alguien se recibió.
   */
  it("con inscripciones: se ARCHIVA, nunca se borra", () => {
    const r = decidirBaja({ enrollments: 1, certificates: 0, payments: 0 });
    expect(r.accion).toBe("archivar");
  });

  it("una sola inscripción ya alcanza para proteger", () => {
    expect(decidirBaja({ enrollments: 1, certificates: 0, payments: 0 }).accion).toBe(
      "archivar"
    );
    expect(decidirBaja({ enrollments: 5, certificates: 2, payments: 12 }).accion).toBe(
      "archivar"
    );
  });

  /**
   * El motivo se dice en palabras y con NÚMEROS: "tiene 5 inscripciones y 2
   * certificados" es accionable; "tiene historial" obliga a ir a buscarlo.
   */
  it("explica QUÉ se está protegiendo, con números", () => {
    const r = decidirBaja({ enrollments: 5, certificates: 2, payments: 12 });
    expect(r.motivo).toContain("5");
    expect(r.motivo).toContain("2");
    expect(r.motivo).toContain("12");
  });

  it("no menciona lo que no existe", () => {
    const r = decidirBaja({ enrollments: 3, certificates: 0, payments: 0 });
    expect(r.motivo).toContain("3");
    expect(r.motivo.toLowerCase()).not.toContain("certificado");
    expect(r.motivo.toLowerCase()).not.toContain("pago");
  });

  /**
   * Coherencia defensiva: si por un dato inconsistente aparecieran
   * certificados sin inscripciones, la respuesta segura sigue siendo archivar.
   * Ante la duda no se destruye.
   */
  it("ante datos inconsistentes, protege", () => {
    expect(decidirBaja({ enrollments: 0, certificates: 1, payments: 0 }).accion).toBe(
      "archivar"
    );
    expect(decidirBaja({ enrollments: 0, certificates: 0, payments: 1 }).accion).toBe(
      "archivar"
    );
  });

  it("sin nada, el motivo dice que se puede borrar", () => {
    const r = decidirBaja({ enrollments: 0, certificates: 0, payments: 0 });
    expect(r.motivo.toLowerCase()).toContain("no tiene");
  });
});
