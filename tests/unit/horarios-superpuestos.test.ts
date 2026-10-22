import { describe, expect, it } from "vitest";
import { horariosSeSuperponen } from "@/lib/schedule-overlap";

/**
 * 2026-10-22 — El aviso "el profesor ya tiene X en un horario que se
 * superpone" comparaba SOLO las fechas de inicio y fin. Un grupo martes y
 * jueves contra uno lunes, miércoles y viernes del mismo profesor saltaba
 * siempre que las fechas se cruzaran, aunque nunca compartieran un día.
 *
 * Ahora tienen que coincidir las tres cosas: fechas, al menos un día de la
 * semana y el horario de ese día. Si falta un dato (días u horario sin
 * cargar) no se puede descartar el choque y se avisa, como antes.
 */
const base = {
  startDate: new Date("2026-10-01"),
  endDate: new Date("2026-12-01") as Date | null,
  daysOfWeek: null as string | null,
  startTime: null as string | null,
  endTime: null as string | null,
};
// lunes=0 … domingo=6
const martesJueves = { ...base, daysOfWeek: "1,3", startTime: "19:00", endTime: "21:00" };
const lunMieVie = { ...base, daysOfWeek: "0,2,4", startTime: "19:00", endTime: "21:00" };

describe("horariosSeSuperponen", () => {
  it("martes y jueves contra lunes, miércoles y viernes: nunca se pisan", () => {
    expect(horariosSeSuperponen(martesJueves, lunMieVie)).toBe(false);
  });

  it("comparten un día y el horario se cruza: se pisan", () => {
    const juevesTarde = { ...base, daysOfWeek: "3", startTime: "20:00", endTime: "22:00" };
    expect(horariosSeSuperponen(martesJueves, juevesTarde)).toBe(true);
  });

  it("comparten el día pero los horarios no se tocan: no se pisan", () => {
    const martesManana = { ...base, daysOfWeek: "1", startTime: "09:00", endTime: "12:00" };
    expect(horariosSeSuperponen(martesJueves, martesManana)).toBe(false);
  });

  it("uno termina justo cuando empieza el otro: no se pisan", () => {
    const martesAntes = { ...base, daysOfWeek: "1", startTime: "17:00", endTime: "19:00" };
    expect(horariosSeSuperponen(martesJueves, martesAntes)).toBe(false);
  });

  it("las fechas no se cruzan: no se pisan aunque coincidan día y hora", () => {
    const despues = { ...martesJueves, startDate: new Date("2027-01-01"), endDate: new Date("2027-03-01") };
    expect(horariosSeSuperponen(martesJueves, despues)).toBe(false);
  });

  it("sin días o sin horario cargado no se puede descartar: avisa", () => {
    expect(horariosSeSuperponen(martesJueves, { ...base })).toBe(true);
    expect(horariosSeSuperponen(martesJueves, { ...lunMieVie, daysOfWeek: "1", startTime: null })).toBe(true);
  });

  it("un grupo sin fecha de fin sigue en curso", () => {
    const abierto = { ...martesJueves, startDate: new Date("2026-11-15"), endDate: null };
    expect(horariosSeSuperponen(martesJueves, abierto)).toBe(true);
  });
});
