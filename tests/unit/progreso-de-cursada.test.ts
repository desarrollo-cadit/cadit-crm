import { describe, expect, it } from "vitest";
import {
  porcentajeDeProgreso,
  progresoDeCursada,
  sumarProgresos,
} from "@/lib/cohort-progress";

/**
 * 2026-10-26 — "Clase X de Y" en el listado de grupos. X = clases reales no
 * canceladas que ya TERMINARON (`estadoDeClase` → `dictada`, la misma regla
 * del % de asistencia); Y = clases reales no canceladas.
 */
const TZ = "America/Montevideo";
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
// 2026-10-26 15:00 en Montevideo (UTC-3).
const reloj = { timeZone: TZ, now: new Date("2026-10-26T18:00:00.000Z") };

describe("progresoDeCursada", () => {
  it("cuenta las dictadas sobre las no canceladas", () => {
    const p = progresoDeCursada(
      [
        { sessionDate: dia("2026-10-19"), endTime: "21:00", canceled: false },
        { sessionDate: dia("2026-10-21"), endTime: "21:00", canceled: true },
        { sessionDate: dia("2026-10-22"), endTime: "21:00", canceled: false },
        { sessionDate: dia("2026-10-29"), endTime: "21:00", canceled: false },
      ],
      reloj
    );
    expect(p).toEqual({ dictadas: 2, total: 3 });
  });

  it("la clase de HOY que todavía no terminó no cuenta como dada", () => {
    const p = progresoDeCursada(
      [
        { sessionDate: dia("2026-10-26"), endTime: "21:00", canceled: false },
        { sessionDate: dia("2026-10-26"), endTime: "14:00", canceled: false },
      ],
      reloj
    );
    expect(p).toEqual({ dictadas: 1, total: 2 });
  });

  it("sin cronograma (o todo cancelado) no hay progreso", () => {
    expect(progresoDeCursada([], reloj)).toBeNull();
    expect(
      progresoDeCursada([{ sessionDate: dia("2026-10-19"), endTime: null, canceled: true }], reloj)
    ).toBeNull();
  });
});

describe("sumarProgresos (especialización = sus módulos)", () => {
  it("suma dictadas y totales, ignorando los que no tienen cronograma", () => {
    expect(
      sumarProgresos([{ dictadas: 10, total: 10 }, null, { dictadas: 8, total: 30 }])
    ).toEqual({ dictadas: 18, total: 40 });
  });

  it("sin ninguno, null", () => {
    expect(sumarProgresos([])).toBeNull();
    expect(sumarProgresos([null, null])).toBeNull();
  });
});

describe("porcentajeDeProgreso", () => {
  it("redondea y queda entre 0 y 100", () => {
    expect(porcentajeDeProgreso({ dictadas: 6, total: 10 })).toBe(60);
    expect(porcentajeDeProgreso({ dictadas: 1, total: 3 })).toBe(33);
    expect(porcentajeDeProgreso({ dictadas: 0, total: 3 })).toBe(0);
    expect(porcentajeDeProgreso({ dictadas: 3, total: 3 })).toBe(100);
  });
});
