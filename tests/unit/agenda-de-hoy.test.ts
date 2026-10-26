import { describe, expect, it } from "vitest";
import { agendaDeHoy, diaDeHoyGuardado, type ClaseDeLaAgenda } from "@/lib/agenda-de-hoy";

/**
 * 2026-10-26 — La agenda de hoy del inicio: qué terminó, qué está en curso y
 * qué viene, con la línea de "ahora" entre las clases. El corte se decide en
 * la zona de la academia con `classInstant` / `classHasEnded`, nunca con la
 * hora del navegador.
 */

const TZ = "America/Montevideo"; // UTC-3, sin horario de verano
const HOY = "2026-10-26T00:00:00.000Z"; // `class_session.date`: medianoche UTC del día
/** 15:42 en Montevideo. */
const AHORA = new Date("2026-10-26T18:42:00Z");
const reloj = { timeZone: TZ, now: AHORA };

const clase = (startTime: string | null, endTime: string | null, extra: Partial<ClaseDeLaAgenda> = {}) => ({
  date: HOY,
  startTime,
  endTime,
  ...extra,
});

describe("agendaDeHoy", () => {
  it("marca terminada, en curso y próxima según la hora de la academia", () => {
    const a = agendaDeHoy([clase("09:00", "12:00"), clase("14:00", "17:00"), clase("18:30", "21:30")], reloj);
    expect(a.filas.map((f) => f.estado)).toEqual(["terminada", "en_curso", "proxima"]);
  });

  it("la línea de ahora va antes de la primera clase que todavía no empezó", () => {
    const a = agendaDeHoy([clase("09:00", "12:00"), clase("14:00", "17:00"), clase("18:30", "21:30")], reloj);
    expect(a.ahoraAntesDe).toBe(2);
    expect(a.horaActual).toBe("15:42");
  });

  it("antes de todas, la línea va arriba; después de todas, abajo", () => {
    const temprano = agendaDeHoy([clase("18:30", "21:30")], { timeZone: TZ, now: new Date("2026-10-26T11:00:00Z") });
    expect(temprano.ahoraAntesDe).toBe(0);
    expect(temprano.horaActual).toBe("08:00");
    const tarde = agendaDeHoy([clase("09:00", "12:00")], reloj);
    expect(tarde.filas[0]?.estado).toBe("terminada");
    expect(tarde.ahoraAntesDe).toBe(1);
  });

  it("no usa la hora UTC: a las 15:42 de Montevideo, una clase de 17:00 a 19:00 no empezó", () => {
    // 18:42 UTC caería DENTRO de 17:00–19:00 si se leyera la hora sin zona.
    const a = agendaDeHoy([clase("17:00", "19:00")], reloj);
    expect(a.filas[0]?.estado).toBe("proxima");
  });

  it("una clase sin horario no se inventa en curso: queda próxima hasta que termina el día", () => {
    const a = agendaDeHoy([clase(null, null)], reloj);
    expect(a.filas[0]?.estado).toBe("proxima");
  });

  it("sin hora de fin, la clase que empezó sigue en curso", () => {
    const a = agendaDeHoy([clase("14:00", null)], reloj);
    expect(a.filas[0]?.estado).toBe("en_curso");
  });

  it("conserva los datos de cada clase (la proyectada sigue siendo proyectada)", () => {
    const a = agendaDeHoy([clase("19:00", "22:00", { projected: true })], reloj);
    expect(a.filas[0]).toMatchObject({ projected: true, startTime: "19:00", estado: "proxima" });
  });

  it("sin clases no hay línea que dibujar", () => {
    expect(agendaDeHoy([], reloj).filas).toEqual([]);
  });
});

describe("diaDeHoyGuardado", () => {
  it("es el día de la academia, guardado a medianoche UTC", () => {
    // 01:30 UTC del 27 = 22:30 del 26 en Montevideo: sigue siendo el 26.
    const d = diaDeHoyGuardado(new Date("2026-10-27T01:30:00Z"), TZ);
    expect(d.toISOString()).toBe("2026-10-26T00:00:00.000Z");
  });
});
