import { describe, expect, it } from "vitest";
import { cursadaNuncaDictada } from "@/lib/cursadas-no-dictadas";

/**
 * 2026-10-22 — Grupos que se planificaron, recibieron inscriptos y nunca
 * salieron. Como la confirmación (039) no existía, nadie los confirmó, y al
 * pasar sus fechas el portal se los mostraba al alumno como "Finalizado",
 * como si los hubiera cursado.
 *
 * Se ocultan al ALUMNO solo si no queda ninguna duda: sin confirmar, ya
 * terminados por fecha y SIN actividad (asistencia, notas o certificado). Un
 * curso viejo que sí se dictó antes de que existiera la confirmación tiene
 * asistencia, y sigue apareciendo.
 */
const ahora = new Date("2026-10-22T12:00:00Z");
const base = {
  confirmedAt: null as Date | null,
  startDate: new Date("2026-07-01"),
  endDate: new Date("2026-09-01") as Date | null,
  courseKind: "curso" as const,
  parentCohortId: null as string | null,
  tuvoActividad: false,
};

describe("cursadaNuncaDictada", () => {
  it("sin confirmar, terminado y sin actividad: nunca se dictó", () => {
    expect(cursadaNuncaDictada(base, ahora)).toBe(true);
  });

  it("con asistencia, notas o certificado: se dictó, aunque nadie lo confirmara", () => {
    expect(cursadaNuncaDictada({ ...base, tuvoActividad: true }, ahora)).toBe(false);
  });

  it("confirmado: se muestra siempre", () => {
    expect(cursadaNuncaDictada({ ...base, confirmedAt: new Date("2026-06-20") }, ahora)).toBe(false);
  });

  it("en curso o por empezar: no se oculta (puede estar dictándose)", () => {
    expect(cursadaNuncaDictada({ ...base, endDate: new Date("2026-12-01") }, ahora)).toBe(false);
    expect(
      cursadaNuncaDictada({ ...base, startDate: new Date("2026-11-01"), endDate: new Date("2026-12-01") }, ahora)
    ).toBe(false);
  });

  it("sin fecha de fin sigue en curso una vez empezado: no se oculta", () => {
    expect(cursadaNuncaDictada({ ...base, endDate: null }, ahora)).toBe(false);
  });

  it("un módulo o un taller no se confirman solos: la regla no los toca", () => {
    expect(cursadaNuncaDictada({ ...base, parentCohortId: "coh_madre" }, ahora)).toBe(false);
    expect(cursadaNuncaDictada({ ...base, courseKind: "taller" as never }, ahora)).toBe(false);
  });
});
