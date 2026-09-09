import { describe, expect, it } from "vitest";
import { validateAccountLink } from "@/server/access";

/**
 * 012 (T014) — Las dos reglas que deciden si un vínculo de portal puede
 * existir, probadas SIN base.
 *
 * `validateAccountLink` es pura a propósito: recibe el hecho ya averiguado
 * ("¿este contacto tiene alguna inscripción?") en vez de ir a buscarlo. Así la
 * regla —que es lo que hay que proteger— se prueba sola, y `createAccountLink`
 * queda como lo que es: la consulta más esta decisión.
 */
describe("validateAccountLink — coherencia de kind (CHECK espejo)", () => {
  it("acepta un alumno con contacto y sin profesor", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "alumno", contactId: "ct_1" },
      { contactHasEnrollment: true }
    );
    expect(r.ok).toBe(true);
  });

  it("acepta un profesor con teacher y sin contacto", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "profesor", teacherId: "tch_1" },
      { contactHasEnrollment: false }
    );
    expect(r.ok).toBe(true);
  });

  it("rechaza un alumno sin contacto", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "alumno" },
      { contactHasEnrollment: true }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("incoherent_link");
  });

  it("rechaza un profesor sin teacher", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "profesor" },
      { contactHasEnrollment: false }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("incoherent_link");
  });

  /**
   * El caso que el CHECK de la base también rechaza: mandar los dos. Sin esta
   * validación el insert explotaría con un error de constraint y el usuario
   * vería un 500 en vez de un mensaje.
   */
  it("rechaza un vínculo con contacto Y profesor a la vez", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "alumno", contactId: "ct_1", teacherId: "tch_1" },
      { contactHasEnrollment: true }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("incoherent_link");
  });

  it("rechaza un profesor que además trae contacto", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "profesor", teacherId: "tch_1", contactId: "ct_1" },
      { contactHasEnrollment: true }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("incoherent_link");
  });
});

/**
 * 012 (FR-005b) — El alumno NACE de la inscripción.
 *
 * Un contacto puede ser un lead que nunca se inscribió, y darle portal sería
 * darle el legajo de una cursada que no existe. Esta regla no puede vivir en
 * un CHECK —no consulta otra tabla—, así que vive acá y necesita su test.
 */
describe("validateAccountLink — el alumno nace de la inscripción (FR-005b)", () => {
  it("rechaza al contacto SIN ninguna inscripción", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "alumno", contactId: "ct_1" },
      { contactHasEnrollment: false }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("not_enrolled");
    expect(r.message).toContain("inscripción");
  });

  /**
   * La regla es SOLO para alumnos: un profesor no se inscribe a nada, y
   * exigirle una inscripción lo dejaría afuera del portal para siempre.
   */
  it("no le exige inscripción al profesor", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "profesor", teacherId: "tch_1" },
      { contactHasEnrollment: false }
    );
    expect(r.ok).toBe(true);
  });

  /**
   * El orden importa: un alumno sin contacto es incoherente ANTES que "sin
   * inscripción". Devolver "no tiene inscripción" para un pedido al que le
   * falta el contacto manda a buscar el problema al lugar equivocado.
   */
  it("la incoherencia gana sobre la falta de inscripción", () => {
    const r = validateAccountLink(
      { userId: "usr_1", kind: "alumno" },
      { contactHasEnrollment: false }
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("incoherent_link");
  });
});
