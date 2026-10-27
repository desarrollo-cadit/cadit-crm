import { describe, expect, it } from "vitest";
import { computeCohortStatus } from "@/lib/cohort-status";
import {
  deGrupoFinalizado,
  estadoPorError,
  fueraDelPlazoDeZoom,
  mensajeDeEstado,
  proximoIntento,
} from "@/lib/zoom-attendance-estado";

/** El estado de "traer de Zoom": reintentos, errores y lo que dice la pantalla. */

const ahora = new Date("2026-10-27T00:00:00Z");

describe("proximoIntento", () => {
  it("30 min → 2 h → 6 h → 24 h y después nada", () => {
    const mins = [1, 2, 3, 4].map((n) => (proximoIntento(n, ahora)!.getTime() - ahora.getTime()) / 60_000);
    expect(mins).toEqual([30, 120, 360, 1440]);
    expect(proximoIntento(5, ahora)).toBeNull();
  });
});

describe("estadoPorError", () => {
  it.each([
    ["no_terminada", "no_lista", true],
    ["sin_permiso", "sin_permiso", false],
    ["fuera_de_plazo", "fuera_de_plazo", false],
    ["zoom_caido", "error", true],
    ["limite_de_tasa", "error", true],
    ["credenciales_invalidas", "error", false],
  ] as const)("%s → %s (reintenta: %s)", (code, estado, reintentar) => {
    expect(estadoPorError(code)).toEqual({ estado, reintentar });
  });
});

describe("fueraDelPlazoDeZoom", () => {
  it("más de un año atrás no se le pregunta a Zoom", () => {
    expect(fueraDelPlazoDeZoom(new Date("2025-10-20T00:00:00Z"), ahora)).toBe(true);
    expect(fueraDelPlazoDeZoom(new Date("2025-11-20T00:00:00Z"), ahora)).toBe(false);
  });
});

describe("mensajeDeEstado", () => {
  it("dice a qué hora se reintenta, en la zona de la academia", () => {
    const m = mensajeDeEstado({
      estado: "no_lista",
      proximo: new Date("2026-10-27T00:30:00Z"),
      detalle: null,
      timeZone: "America/Montevideo",
    });
    expect(m).toBe("Zoom todavía no tiene el reporte. Se vuelve a intentar a las 21:30.");
  });

  it("sin permiso muestra el detalle propio (los permisos que faltan)", () => {
    expect(
      mensajeDeEstado({ estado: "sin_permiso", proximo: null, detalle: "Faltan permisos: X", timeZone: "UTC" })
    ).toBe("Faltan permisos: X");
  });
});

describe("deGrupoFinalizado — la MISMA regla que Académico (computeCohortStatus)", () => {
  const dia = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it("terminado por fecha: sí; en curso, sin fecha de fin o por empezar: no", () => {
    const now = new Date("2026-10-27T15:00:00Z");
    expect(deGrupoFinalizado({ cohortStartDate: dia("2026-03-01"), cohortEndDate: dia("2026-07-30") }, now)).toBe(true);
    expect(deGrupoFinalizado({ cohortStartDate: dia("2026-09-01"), cohortEndDate: dia("2026-12-15") }, now)).toBe(false);
    expect(deGrupoFinalizado({ cohortStartDate: dia("2026-03-01"), cohortEndDate: null }, now)).toBe(false);
    expect(deGrupoFinalizado({ cohortStartDate: dia("2026-11-10"), cohortEndDate: dia("2026-12-15") }, now)).toBe(false);
  });

  it("coincide con computeCohortStatus en todos los casos", () => {
    const now = new Date("2026-10-27T15:00:00Z");
    for (const [start, end] of [
      [dia("2026-01-01"), dia("2026-10-26")],
      [dia("2026-01-01"), dia("2026-10-28")],
      [dia("2026-01-01"), null],
    ] as const) {
      expect(deGrupoFinalizado({ cohortStartDate: start, cohortEndDate: end }, now)).toBe(
        computeCohortStatus(start, end, now) === "finalizada"
      );
    }
  });
});
