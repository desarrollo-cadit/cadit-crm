import { describe, expect, it } from "vitest";
import { buildClassRow, cannotGenerateReason } from "@/server/classes";
import { buildClassSchedule } from "@/server/attendance";

/**
 * 013 (T009) — **En este repo, `days_of_week` cuenta desde el LUNES.**
 *
 * `WEEKDAY_LABELS` es `["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]`, así que
 * `"0,2,4"` significa lunes/miércoles/viernes — NO domingo/martes/jueves, que
 * es lo que daría `Date.getDay()`. `buildClassSchedule` convierte con
 * `(getDay() + 6) % 7`.
 *
 * Este caso existe porque verificando la fase 2 leí el resultado con la
 * convención de JavaScript y estuve a punto de reportar un bug que no
 * existía. La próxima persona va a leerlo igual: que falle un test es más
 * barato que una tarde de depuración.
 */
describe("days_of_week cuenta desde el LUNES, no desde el domingo", () => {
  it("«0» es lunes", () => {
    // Semana del 5 al 11 de octubre de 2026: el 5 es lunes.
    const plan = buildClassSchedule(
      new Date(2026, 9, 5),
      new Date(2026, 9, 11),
      "0",
      2
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.date.getDate()).toBe(5);
  });

  it("«6» es domingo", () => {
    const plan = buildClassSchedule(
      new Date(2026, 9, 5),
      new Date(2026, 9, 11),
      "6",
      2
    );
    expect(plan).toHaveLength(1);
    expect(plan[0]!.date.getDate()).toBe(11);
  });

  it("«0,2,4» es lunes, miércoles y viernes", () => {
    const plan = buildClassSchedule(
      new Date(2026, 9, 5),
      new Date(2026, 9, 11),
      "0,2,4",
      2
    );
    expect(plan.map((p) => p.date.getDate())).toEqual([5, 7, 9]);
  });
});

/**
 * 013 (T009, FR-005c/FR-005e, DV-006) — Las reglas de la lista de clases.
 *
 * Una sola lista donde cada fila cambia según el momento: sin enlace, "entrar
 * a la clase", "ver grabación", "grabación pendiente" o "cancelada". Lo que se
 * prueba acá es qué ofrece cada fila, que es de donde salen esas etiquetas.
 */

const ZONA = "America/Montevideo";
const VENTANA = { beforeMin: 15, afterMin: 30 };
const DIA = new Date("2026-03-10T00:00:00.000Z");

/** 18:30 en Montevideo = 21:30 UTC. */
const INICIO = new Date("2026-03-10T21:30:00.000Z");
const enMinutos = (base: Date, min: number) => new Date(base.getTime() + min * 60_000);

function fila(over: Partial<Parameters<typeof buildClassRow>[0]> = {}) {
  return buildClassRow({
    id: "cls_1",
    number: 1,
    projected: false,
    date: DIA,
    startTime: "18:30",
    endTime: "20:30",
    topic: "Introducción",
    canceledAt: null,
    cancelReason: null,
    meetingUrl: null,
    cohortMeetingUrl: "https://zoom.us/j/cohorte",
    recordingUrl: null,
    timezone: ZONA,
    window: VENTANA,
    now: INICIO,
    ...over,
  });
}

describe("buildClassRow — qué ofrece cada fila según el momento", () => {
  it("resuelve el instante real en la zona de la academia", () => {
    expect(fila().startsAt).toBe("2026-03-10T21:30:00.000Z");
    expect(fila().endsAt).toBe("2026-03-10T23:30:00.000Z");
  });

  it("en horario, ofrece el enlace de la reunión", () => {
    expect(fila().meetingUrl).toBe("https://zoom.us/j/cohorte");
  });

  it("una hora antes todavía no lo ofrece", () => {
    expect(fila({ now: enMinutos(INICIO, -60) }).meetingUrl).toBeNull();
  });

  /**
   * **Herencia, no copia.** La clase usa el enlace de la cohorte salvo que
   * tenga el suyo. Si se copiara al generar el cronograma, cambiar el Zoom de
   * la cohorte dejaría 41 cohortes con enlaces muertos.
   */
  it("el enlace propio de la clase PISA el de la cohorte", () => {
    const r = fila({ meetingUrl: "https://meet.google.com/clase-puntual" });
    expect(r.meetingUrl).toBe("https://meet.google.com/clase-puntual");
  });

  it("sin enlace en ningún lado, no inventa uno", () => {
    expect(fila({ cohortMeetingUrl: null }).meetingUrl).toBeNull();
  });

  /**
   * FR-005e — Entrar a la reunión de una clase que no va a existir es peor
   * que no encontrar el enlace.
   */
  it("una clase CANCELADA no ofrece enlace ni grabación", () => {
    const r = fila({
      canceledAt: new Date("2026-03-05T00:00:00.000Z"),
      cancelReason: "El profesor está enfermo",
      recordingUrl: "https://drive.google.com/grabacion",
    });
    expect(r.canceled).toBe(true);
    expect(r.cancelReason).toBe("El profesor está enfermo");
    expect(r.meetingUrl).toBeNull();
    expect(r.recordingUrl).toBeNull();
  });

  it("terminada y con grabación, la ofrece", () => {
    const r = fila({
      now: enMinutos(INICIO, 60 * 24),
      recordingUrl: "https://drive.google.com/grabacion",
    });
    expect(r.recordingUrl).toBe("https://drive.google.com/grabacion");
    expect(r.meetingUrl).toBeNull(); // la ventana ya cerró
  });

  it("terminada sin grabación: no hay nada que ofrecer todavía", () => {
    const r = fila({ now: enMinutos(INICIO, 60 * 24) });
    expect(r.recordingUrl).toBeNull();
    expect(r.meetingUrl).toBeNull();
  });

  /**
   * Una proyección es un DIBUJO: no es una clase que exista. No puede ofrecer
   * enlace ni grabación aunque la cohorte tenga uno cargado.
   */
  it("una PROYECCIÓN no ofrece enlace ni grabación, aunque sea su horario", () => {
    const r = fila({ projected: true, id: null });
    expect(r.projected).toBe(true);
    expect(r.id).toBeNull();
    expect(r.meetingUrl).toBeNull();
    expect(r.recordingUrl).toBeNull();
  });

  /** Las 6 cohortes reales sin horario cargado. */
  it("sin horario, no hay instante ni enlace, pero la fila existe", () => {
    const r = fila({ startTime: null, endTime: null });
    expect(r.startsAt).toBeNull();
    expect(r.meetingUrl).toBeNull();
    expect(r.date).toBe(DIA.toISOString());
  });
});

/**
 * 013 (T009, criterio T017d de 012) — Por qué NO se puede generar el
 * cronograma, en palabras.
 *
 * Medido: de 41 cohortes reales, **35 pueden** y **6 no** — 4 sin días
 * declarados, 1 sin fecha de fin, 1 sin ninguno de los dos. Son dos problemas
 * distintos y la pantalla tiene que poder decir CUÁL, no un "faltan datos".
 */
describe("cannotGenerateReason — el motivo, no un botón que falla", () => {
  it("con días y fecha de fin, se puede generar", () => {
    expect(
      cannotGenerateReason({ endDate: new Date("2026-06-01"), daysOfWeek: "1,3" })
    ).toBeNull();
  });

  it("sin días declarados, lo dice y dice dónde cargarlos", () => {
    const motivo = cannotGenerateReason({ endDate: new Date("2026-06-01"), daysOfWeek: null });
    expect(motivo).toContain("días de cursada");
    expect(motivo).toContain("edición de la cohorte");
  });

  it("días en blanco cuenta como no declarados", () => {
    expect(
      cannotGenerateReason({ endDate: new Date("2026-06-01"), daysOfWeek: "   " })
    ).toContain("días de cursada");
  });

  it("sin fecha de fin, lo dice con ESE motivo y no con el otro", () => {
    const motivo = cannotGenerateReason({ endDate: null, daysOfWeek: "1,3" });
    expect(motivo).toContain("fecha de fin");
    expect(motivo).not.toContain("días de cursada");
  });

  /**
   * A la cohorte que no tiene ninguno de los dos se le informa UN motivo por
   * vez: arreglar el primero revela el segundo. Decir los dos junto sería más
   * completo y menos accionable.
   */
  it("sin ninguno de los dos, informa uno solo", () => {
    const motivo = cannotGenerateReason({ endDate: null, daysOfWeek: null });
    expect(motivo).toContain("días de cursada");
  });
});
