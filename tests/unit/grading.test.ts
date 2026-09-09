import { describe, expect, it } from "vitest";
import { approvalState, generateCertificateCode } from "@/server/grading";

/**
 * 010 — La regla que decide si un alumno se recibe.
 *
 * DV-001: escala aprobado / no aprobado, sin ponderación. Un alumno aprueba
 * si aprobó TODAS las evaluaciones obligatorias Y cumple la asistencia
 * mínima (FR-004).
 */
describe("approvalState", () => {
  it("aprueba con todas las evaluaciones y la asistencia cumplida", () => {
    const r = approvalState([true, true], 90, 75);
    expect(r.state).toBe("aprobado");
    expect(r.reasons).toEqual([]);
  });

  /**
   * FR-005 — una evaluación sin corregir NO reprueba. Marcar como reprobado
   * a quien todavía no fue evaluado es acusarlo de algo que no pasó.
   */
  it("una evaluación sin corregir deja pendiente, nunca reprobado", () => {
    const r = approvalState([true, null], 90, 75);
    expect(r.state).toBe("pendiente");
    expect(r.reasons.join(" ")).toContain("Falta corregir");
  });

  it("desaprobar una obligatoria reprueba, aunque la asistencia sea perfecta", () => {
    const r = approvalState([true, false], 100, 75);
    expect(r.state).toBe("reprobado");
    expect(r.reasons.join(" ")).toContain("Desaprobó");
  });

  /** FR-004 — los dos criterios se cruzan; no alcanza con las notas. */
  it("la asistencia insuficiente reprueba aunque las notas estén todas bien", () => {
    const r = approvalState([true, true], 50, 75);
    expect(r.state).toBe("reprobado");
    expect(r.reasons.join(" ")).toContain("Asistencia 50%");
    expect(r.reasons.join(" ")).toContain("mínimo 75%");
  });

  it("informa los DOS motivos cuando fallan los dos criterios", () => {
    const r = approvalState([false, true], 40, 75);
    expect(r.state).toBe("reprobado");
    expect(r.reasons).toHaveLength(2);
  });

  /** Reprobado gana sobre pendiente: una corrección faltante no lo salva. */
  it("reprobado gana sobre pendiente", () => {
    const r = approvalState([false, null], 90, 75);
    expect(r.state).toBe("reprobado");
  });

  it("sin mínimo de asistencia definido, solo cuentan las evaluaciones", () => {
    expect(approvalState([true, true], null, null).state).toBe("aprobado");
    expect(approvalState([true, true], 10, null).state).toBe("aprobado");
  });

  /**
   * Con mínimo exigido pero sin ninguna clase registrada, el alumno queda
   * PENDIENTE: no se puede afirmar que cumplió ni que no.
   */
  it("con mínimo exigido y sin asistencia registrada queda pendiente", () => {
    const r = approvalState([true, true], null, 75);
    expect(r.state).toBe("pendiente");
    expect(r.reasons.join(" ")).toContain("asistencia");
  });

  it("justo en el mínimo, aprueba", () => {
    expect(approvalState([true], 75, 75).state).toBe("aprobado");
    expect(approvalState([true], 74, 75).state).toBe("reprobado");
  });

  it("una cohorte sin evaluaciones aprueba solo por asistencia", () => {
    expect(approvalState([], 80, 75).state).toBe("aprobado");
    expect(approvalState([], 60, 75).state).toBe("reprobado");
  });
});

/**
 * FR-010 — el código no puede ser adivinable ni secuencial: con un
 * correlativo, cualquiera con un código recorre el endpoint público y lista a
 * todos los egresados de la academia.
 */
describe("generateCertificateCode", () => {
  it("tiene el formato XXXX-XXXX-XXXX", () => {
    expect(generateCertificateCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  it("no repite: 500 códigos son 500 distintos", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateCertificateCode()));
    expect(codes.size).toBe(500);
  });

  /** Se dicta por teléfono: sin 0/O ni 1/I/L, que se confunden al copiar. */
  it("evita los caracteres ambiguos", () => {
    const todos = Array.from({ length: 200 }, () => generateCertificateCode()).join("");
    expect(todos).not.toMatch(/[01OIL]/);
  });
});
