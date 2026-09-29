import { afterEach, describe, expect, it, vi } from "vitest";
import { relativeDay } from "@/components/portal/student-bits";

/**
 * "hoy", "mañana", "en 3 días": el día de la clase contado en la zona de
 * quien mira. El caso que importa es cerca de la medianoche, cuando la fecha
 * en UTC ya es otra: una prueba corrida desde una sola zona no lo ve nunca.
 */
describe("relativeDay", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a las 22:00 en Montevideo, una clase de mañana a las 10:00 es «mañana»", () => {
    vi.useFakeTimers();
    // Lunes 22:00 en Montevideo (UTC−3) = martes 01:00 UTC.
    vi.setSystemTime(new Date("2026-09-29T01:00:00Z"));
    // Martes 10:00 en Montevideo = martes 13:00 UTC.
    expect(relativeDay("2026-09-29T13:00:00Z", "America/Montevideo")).toBe("mañana");
  });

  it("el mismo día calendario en la zona es «hoy»", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    expect(relativeDay("2026-09-29T21:30:00Z", "America/Montevideo")).toBe("hoy");
  });

  it("cuenta días calendario, no horas", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-29T12:00:00Z"));
    expect(relativeDay("2026-10-02T12:00:00Z", "America/Montevideo")).toBe("en 3 días");
    expect(relativeDay("2026-09-27T12:00:00Z", "America/Montevideo")).toBe("hace 2 días");
  });
});
