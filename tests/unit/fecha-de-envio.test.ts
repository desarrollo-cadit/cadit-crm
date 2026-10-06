import { describe, expect, it } from "vitest";
import { formatSentAt } from "@/lib/schedule-time";

/**
 * 2026-10-05 — "Ya se envió el 5 oct. 2026, 14:32". La hora es la de la
 * academia (Montevideo), no la del navegador ni la del servidor: quien lee
 * "14:32" está pensando en la hora de la oficina.
 */
describe("formatSentAt", () => {
  it("muestra día, mes, año y hora en Montevideo", () => {
    expect(formatSentAt("2026-10-05T17:32:00.000Z")).toBe("5 oct. 2026, 14:32");
  });

  it("pasada la medianoche UTC, en Montevideo sigue siendo el día anterior", () => {
    expect(formatSentAt("2026-10-06T01:15:00.000Z")).toBe("5 oct. 2026, 22:15");
  });

  it("una fecha ilegible no rompe la pantalla", () => {
    expect(formatSentAt("no-es-una-fecha")).toBe("una fecha sin registrar");
  });
});
