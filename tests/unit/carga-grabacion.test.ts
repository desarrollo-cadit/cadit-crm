import { describe, expect, it } from "vitest";
import {
  puedeCargarGrabacion,
  type ClassRow,
} from "@/components/portal/portal-cohort-client";

/**
 * 025 — Cuándo aparece el botón de cargar la grabación, en el portal del
 * profesor.
 *
 * La primera versión comparaba `c.date` —la MEDIANOCHE UTC del día de la
 * clase— contra el reloj del navegador. En Montevideo (UTC-3) eso hacía
 * aparecer el botón **el día anterior a las 21:00**, casi un día entero antes
 * de que la clase existiera. El comentario decía "el día entero cuenta" y lo
 * que pasaba era otra cosa, que es la peor combinación posible.
 *
 * La corrección mira `endsAt`, que el servidor ya resolvió con
 * `classInstant()` — el único lugar del repo autorizado a componer una fecha
 * de clase. Estos tests fijan el comportamiento por instantes, no por textos,
 * porque el bug vivía exactamente en esa diferencia.
 */

const clase = (over: Partial<ClassRow> = {}): ClassRow => ({
  id: "cls_1",
  number: 3,
  projected: false,
  date: "2026-09-04T00:00:00.000Z",
  startTime: "18:30",
  endTime: "21:30",
  // 18:30–21:30 del 4 de septiembre en Montevideo (UTC-3).
  endsAt: "2026-09-05T00:30:00.000Z",
  topic: null,
  canceled: false,
  cancelReason: null,
  meetingUrl: null,
  recordingUrl: null,
  ...over,
});

const enMontevideo = (iso: string) => new Date(iso).getTime();

describe("025 — el botón de cargar grabación", () => {
  /**
   * El caso que reportó el revisor, y el que hacía falso al comentario: la
   * medianoche UTC del 4 es la noche del 3 en Montevideo.
   */
  it("NO aparece la noche anterior, aunque ya sea el día siguiente en UTC", () => {
    // 21:30 del 3 de septiembre en Montevideo = 00:30 UTC del 4.
    expect(puedeCargarGrabacion(clase(), enMontevideo("2026-09-04T00:30:00Z"))).toBe(
      false
    );
  });

  it("NO aparece mientras la clase está en curso", () => {
    // 20:00 del 4 en Montevideo: empezó a las 18:30, termina 21:30.
    expect(puedeCargarGrabacion(clase(), enMontevideo("2026-09-04T23:00:00Z"))).toBe(
      false
    );
  });

  it("aparece apenas la clase termina", () => {
    expect(puedeCargarGrabacion(clase(), enMontevideo("2026-09-05T00:30:00Z"))).toBe(
      true
    );
  });

  it("sigue apareciendo días después: la grabación se sube cuando se puede", () => {
    expect(puedeCargarGrabacion(clase(), enMontevideo("2026-09-20T12:00:00Z"))).toBe(
      true
    );
  });

  /** FR-005e de 013 — una clase cancelada no ofrece grabación. */
  it("no aparece en una clase cancelada, por más que haya pasado", () => {
    expect(
      puedeCargarGrabacion(
        clase({ canceled: true }),
        enMontevideo("2026-09-20T12:00:00Z")
      )
    ).toBe(false);
  });

  /** Una proyección no tiene fila a la cual colgarle nada. */
  it("no aparece en una proyección", () => {
    expect(
      puedeCargarGrabacion(
        clase({ id: null, projected: true }),
        enMontevideo("2026-09-20T12:00:00Z")
      )
    ).toBe(false);
  });

  /**
   * 6 de las 41 cohortes reales no tienen horario cargado, así que no hay
   * instante que comparar. Se deja pasar: no saber cuándo terminó no es lo
   * mismo que saber que no terminó, y bloquear al profesor por un dato que
   * falta en la COHORTE lo devuelve a pedir la carga por WhatsApp.
   */
  it("sin horario cargado, se deja pasar en vez de bloquear", () => {
    expect(
      puedeCargarGrabacion(
        clase({ startTime: null, endTime: null, endsAt: null }),
        enMontevideo("2020-01-01T00:00:00Z")
      )
    ).toBe(true);
  });
});
