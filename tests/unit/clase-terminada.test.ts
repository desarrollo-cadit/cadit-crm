import { describe, expect, it } from "vitest";
import { classEndsAt, classHasEnded } from "@/lib/schedule-time";
import { buildMilestones } from "@/server/student-portal";

/**
 * Bug de producción (2026-10-14): una cohorte que empezaba ese día a las 18:30
 * mostraba la primera clase "cumplida" a la mañana y la mitad del curso como
 * etapa actual. El día de clase viaja como medianoche UTC, que en Montevideo
 * son las 21:00 del día anterior.
 */
const TZ = "America/Montevideo";
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("cuándo terminó una clase", () => {
  it("termina a su hora de fin en la zona de la academia", () => {
    expect(classEndsAt(dia("2026-10-14"), "20:30", TZ).toISOString()).toBe(
      "2026-10-14T23:30:00.000Z"
    );
  });

  it("sin horario, termina al final de su día en la academia, no en UTC", () => {
    expect(classEndsAt(dia("2026-10-14"), null, TZ).toISOString()).toBe(
      "2026-10-15T03:00:00.000Z"
    );
  });

  it("la mañana del día de la clase, la clase NO se dio", () => {
    const manana = new Date("2026-10-14T12:00:00.000Z"); // 09:00 en Montevideo
    expect(classHasEnded({ date: dia("2026-10-14"), endTime: "20:30" }, TZ, manana)).toBe(false);
    const despues = new Date("2026-10-14T23:31:00.000Z"); // 20:31
    expect(classHasEnded({ date: dia("2026-10-14"), endTime: "20:30" }, TZ, despues)).toBe(true);
  });
});

describe("recorrido de una cursada que empieza hoy", () => {
  const fechas = ["2026-10-14", "2026-10-16", "2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26"];
  const classes = fechas.map((f, i) => ({
    date: dia(f),
    number: i + 1,
    endsAt: classEndsAt(dia(f), "20:30", TZ),
  }));
  const base = {
    enrolledAt: new Date("2026-10-14T11:00:00.000Z"),
    classes,
    attendancePct: null,
    minAttendancePct: null,
    assessments: [],
    certificate: null,
  };

  it("antes de la primera clase, lo próximo es la primera clase y la mitad sigue pendiente", () => {
    const hitos = buildMilestones({ ...base, now: new Date("2026-10-14T15:00:00.000Z") });
    const estado = Object.fromEntries(hitos.map((h) => [h.key, h.state]));
    expect(estado["primera-clase"]).toBe("en_curso");
    expect(estado["mitad"]).toBe("pendiente");
  });

  it("después de la primera clase, recién ahí queda cumplida", () => {
    const hitos = buildMilestones({ ...base, now: new Date("2026-10-15T01:00:00.000Z") });
    const estado = Object.fromEntries(hitos.map((h) => [h.key, h.state]));
    expect(estado["primera-clase"]).toBe("cumplido");
    expect(estado["mitad"]).toBe("en_curso");
  });
});
