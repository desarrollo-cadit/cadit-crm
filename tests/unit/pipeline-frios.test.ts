import { describe, expect, it } from "vitest";
import { diasSinActividad } from "@/components/pipeline/pipeline-client";

/**
 * 021 — Cuántos días hace que nadie toca un lead.
 *
 * El tablero mostraba la fecha de última actividad, y una fecha hay que
 * restarla mentalmente para saber si importa. Un lead de hace tres semanas se
 * leía igual que uno de ayer, así que el tablero listaba en vez de decir dónde
 * actuar.
 *
 * La regla se prueba porque equivocarla tiene un costo asimétrico: marcar de
 * pendiente a todo el tablero es exactamente lo mismo que no marcar nada.
 */

const HOY = new Date("2026-09-01T12:00:00.000Z");

describe("diasSinActividad", () => {
  it("cuenta los días completos desde la última actividad", () => {
    expect(diasSinActividad("2026-08-18T12:00:00.000Z", HOY)).toBe(14);
    expect(diasSinActividad("2026-08-31T12:00:00.000Z", HOY)).toBe(1);
  });

  it("una actividad de hoy da 0, no 1", () => {
    expect(diasSinActividad("2026-09-01T09:00:00.000Z", HOY)).toBe(0);
  });

  /**
   * **La distinción que evita la alarma falsa.** Un lead recién creado no está
   * frío: está sin empezar. Tratar el `null` como "infinitos días" pintaría de
   * pendiente a todo lo que entra al tablero, justo cuando llega.
   */
  it("sin actividad nunca devuelve null, no un número enorme", () => {
    expect(diasSinActividad(null, HOY)).toBeNull();
  });

  it("no redondea para arriba: 23 horas siguen siendo 0 días", () => {
    expect(diasSinActividad("2026-08-31T13:00:00.000Z", HOY)).toBe(0);
  });

  /**
   * Una fecha futura —reloj desincronizado, dato importado mal— da negativo.
   * Se deja pasar el número tal cual en vez de recortarlo a 0: un lead con
   * "hace -3 días" es visiblemente raro, y esconderlo lo volvería invisible.
   */
  it("una fecha futura da negativo, y eso se ve", () => {
    expect(diasSinActividad("2026-09-05T12:00:00.000Z", HOY)).toBeLessThan(0);
  });
});
