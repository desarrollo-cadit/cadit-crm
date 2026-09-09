import { describe, expect, it } from "vitest";
import {
  attendancePercentage,
  buildClassSchedule,
  hoursFromTimes,
  resolveMinAttendance,
} from "@/server/attendance";

/**
 * 009 — El porcentaje de asistencia se deriva, y su denominador tiene dos
 * reglas que lo separan de un `count` cualquiera (FR-004). Estos casos son la
 * red de esas dos reglas.
 */
describe("buildClassSchedule", () => {
  it("genera una clase por cada día declarado dentro del rango", () => {
    // 2026-09-01 es martes. "0,2" = lunes y miércoles.
    const plan = buildClassSchedule(
      new Date("2026-09-01T00:00:00"),
      new Date("2026-09-14T00:00:00"),
      "0,2",
      2
    );
    expect(plan.map((p) => p.date.toISOString().slice(0, 10))).toEqual([
      "2026-09-02",
      "2026-09-07",
      "2026-09-09",
      "2026-09-14",
    ]);
    expect(plan.map((p) => p.number)).toEqual([1, 2, 3, 4]);
    expect(plan.every((p) => p.hours === 2)).toBe(true);
  });

  /**
   * Sin días declarados es preferible no generar nada: inventar una clase por
   * día obliga a alguien a borrar cuarenta a mano.
   */
  it("sin días de cursada no genera nada", () => {
    expect(buildClassSchedule(new Date("2026-09-01"), new Date("2026-10-01"), null, 2)).toEqual([]);
    expect(buildClassSchedule(new Date("2026-09-01"), new Date("2026-10-01"), "", 2)).toEqual([]);
  });

  it("no genera nada si el rango está invertido", () => {
    expect(
      buildClassSchedule(new Date("2026-10-01"), new Date("2026-09-01"), "0", 2)
    ).toEqual([]);
  });
});

describe("attendancePercentage", () => {
  const d = (s: string) => new Date(`${s}T00:00:00`);

  it("tarde cuenta como presente (DV-002)", () => {
    const pct = attendancePercentage(
      [
        { sessionDate: d("2026-09-01"), canceled: false, status: "presente" },
        { sessionDate: d("2026-09-03"), canceled: false, status: "tarde" },
      ],
      null
    );
    expect(pct).toBe(100);
  });

  it("justificado NO suma: el alumno no estuvo", () => {
    const pct = attendancePercentage(
      [
        { sessionDate: d("2026-09-01"), canceled: false, status: "presente" },
        { sessionDate: d("2026-09-03"), canceled: false, status: "justificado" },
      ],
      null
    );
    expect(pct).toBe(50);
  });

  /** Si contaran, cancelar una clase le bajaría la asistencia a toda la cohorte. */
  it("las clases canceladas salen del denominador", () => {
    const pct = attendancePercentage(
      [
        { sessionDate: d("2026-09-01"), canceled: false, status: "presente" },
        { sessionDate: d("2026-09-03"), canceled: true, status: null },
      ],
      null
    );
    expect(pct).toBe(100);
  });

  /** El que entra en la cuarta semana no arranca con tres semanas de faltas. */
  it("las clases anteriores a la inscripción no cuentan", () => {
    const pct = attendancePercentage(
      [
        { sessionDate: d("2026-09-01"), canceled: false, status: null },
        { sessionDate: d("2026-09-03"), canceled: false, status: null },
        { sessionDate: d("2026-09-10"), canceled: false, status: "presente" },
      ],
      d("2026-09-08")
    );
    expect(pct).toBe(100);
  });

  it("una falta sin marcar cuenta como ausencia", () => {
    const pct = attendancePercentage(
      [
        { sessionDate: d("2026-09-01"), canceled: false, status: "presente" },
        { sessionDate: d("2026-09-03"), canceled: false, status: null },
      ],
      null
    );
    expect(pct).toBe(50);
  });

  /**
   * "Todavía no hay de qué calcular" y "vino a cero clases" son cosas
   * distintas: mostrar 0% en una cohorte que no empezó es una mentira que
   * alguien va a usar para decidir.
   */
  it("sin clases elegibles devuelve null, no 0", () => {
    expect(attendancePercentage([], null)).toBeNull();
    expect(
      attendancePercentage(
        [{ sessionDate: d("2026-09-01"), canceled: true, status: null }],
        null
      )
    ).toBeNull();
  });
});

describe("resolveMinAttendance", () => {
  it("manda la cohorte sobre el curso", () => {
    expect(resolveMinAttendance(80, 75)).toBe(80);
  });

  it("sin valor en la cohorte hereda el del curso", () => {
    expect(resolveMinAttendance(null, 75)).toBe(75);
  });

  it("sin ninguno de los dos no hay requisito", () => {
    expect(resolveMinAttendance(null, null)).toBeNull();
  });

  it("un 0 explícito en la cohorte NO se pisa con el del curso", () => {
    expect(resolveMinAttendance(0, 75)).toBe(0);
  });
});

describe("hoursFromTimes", () => {
  it("calcula las horas del rango", () => {
    expect(hoursFromTimes("18:30", "20:30")).toBe(2);
    expect(hoursFromTimes("09:00", "13:00")).toBe(4);
  });

  it("null cuando falta un extremo o el rango no cierra", () => {
    expect(hoursFromTimes(null, "20:30")).toBeNull();
    expect(hoursFromTimes("20:30", "18:30")).toBeNull();
    expect(hoursFromTimes("no es hora", "20:30")).toBeNull();
  });
});
