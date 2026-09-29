import { describe, expect, it } from "vitest";
import { reasonForStudent } from "@/server/student-reasons";

/**
 * Las razones de aprobación de `grading.ts` están en tercera persona porque
 * también las lee el staff en la planilla. Al alumno se le dicen a él.
 */
describe("reasonForStudent", () => {
  it.each([
    ["Desaprobó una evaluación obligatoria", "No aprobaste una evaluación obligatoria"],
    ["Desaprobó 3 evaluaciones obligatorias", "No aprobaste 3 evaluaciones obligatorias"],
    ["Asistencia 62% (mínimo 80%)", "Tu asistencia es del 62%; para aprobar se pide 80%"],
    ["Falta corregir una evaluación", "Tu profesor todavía tiene que corregir una evaluación"],
    ["Faltan corregir 2 evaluaciones", "Tu profesor todavía tiene que corregir 2 evaluaciones"],
    [
      "Un módulo sin datos: nadie cargó evaluaciones ni asistencia",
      "Hay un módulo que todavía no tiene evaluaciones ni asistencia cargadas",
    ],
    [
      "2 módulos sin datos: nadie cargó evaluaciones ni asistencia",
      "Hay 2 módulos que todavía no tienen evaluaciones ni asistencia cargadas",
    ],
    ["Falta aprobar un módulo", "Te falta aprobar un módulo"],
    ["Faltan aprobar 4 módulos", "Te faltan aprobar 4 módulos"],
    [
      "Nadie cargó todavía evaluaciones obligatorias ni asistencia de este módulo",
      "Todavía no hay evaluaciones ni asistencia cargadas en este módulo",
    ],
  ])("%s", (entrada, esperado) => {
    expect(reasonForStudent(entrada)).toBe(esperado);
  });

  it("conserva el motivo de la dispensa detrás de la asistencia", () => {
    expect(
      reasonForStudent(
        "Asistencia 62% (mínimo 80%) — dispensa otorgada por Ana el 1/9/2026: viaje"
      )
    ).toBe(
      "Tu asistencia es del 62%; para aprobar se pide 80% — dispensa otorgada por Ana el 1/9/2026: viaje"
    );
  });

  it("deja pasar sin tocar lo que no reconoce", () => {
    expect(reasonForStudent("Todavía no hay asistencia registrada")).toBe(
      "Todavía no hay asistencia registrada"
    );
  });
});
