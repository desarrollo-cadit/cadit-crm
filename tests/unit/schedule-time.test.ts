import { describe, expect, it } from "vitest";
import {
  classInstant,
  meetingLinkVisible,
  formatInZone,
  wallClockInZone,
} from "@/lib/schedule-time";

/**
 * 013 (T005, FR-010b) — El riesgo real de la fase.
 *
 * Los horarios de clase son texto (`"18:30"`) sin zona. Mientras los miraba
 * coordinación desde Montevideo daba igual; con **42 alumnos en Paraguay y 45
 * en otros países** (Dominicana, España), componer mal la fecha real de una
 * clase no rompe nada visible: simplemente 87 personas llegan tarde.
 *
 * Por eso la composición vive en UNA función pura y probada, y nadie más
 * compone fechas de clase a mano.
 */

/** El día de la clase, como lo guarda `class_session.date`. */
const dia = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("classInstant — de texto sin zona a instante real", () => {
  /**
   * La comprobación más fuerte, y la que no depende de que yo recuerde bien
   * ningún offset: si componemos "18:30 en tal zona" y después formateamos ese
   * instante EN ESA MISMA ZONA, tiene que volver a decir 18:30. Siempre.
   */
  it.each([
    ["America/Montevideo", "2026-03-10", "18:30"],
    ["America/Asuncion", "2026-03-10", "18:30"],
    ["Europe/Madrid", "2026-03-10", "18:30"],
    ["America/Santo_Domingo", "2026-07-15", "09:00"],
    // Justo después del cambio de horario europeo de verano.
    ["Europe/Madrid", "2026-07-15", "18:30"],
    // Y justo después del de invierno.
    ["Europe/Madrid", "2026-12-15", "18:30"],
  ])("ida y vuelta en %s (%s %s)", (zona, fecha, hora) => {
    const instante = classInstant(dia(fecha), hora, zona);
    expect(instante).not.toBeNull();
    expect(formatInZone(instante!, zona)).toBe(hora);
  });

  /**
   * Uruguay dejó el horario de verano en 2015: está fijo en UTC-3. Es el caso
   * concreto que ancla el resto — si esto falla, la función está mal.
   */
  it("Montevideo está en UTC-3: 18:30 local son las 21:30 UTC", () => {
    const instante = classInstant(dia("2026-03-10"), "18:30", "America/Montevideo");
    expect(instante!.toISOString()).toBe("2026-03-10T21:30:00.000Z");
  });

  /**
   * El mismo texto, en dos zonas distintas, tiene que dar instantes distintos.
   * Sin este caso, una función que ignorara la zona pasaría todo lo de arriba.
   */
  it("la MISMA hora en zonas distintas da instantes distintos", () => {
    const mvd = classInstant(dia("2026-03-10"), "18:30", "America/Montevideo");
    const mad = classInstant(dia("2026-03-10"), "18:30", "Europe/Madrid");
    expect(mvd!.getTime()).not.toBe(mad!.getTime());
  });

  /**
   * Europa sí cambia de hora. El mismo horario de pared en julio y en
   * diciembre cae en offsets distintos: si la función usara un offset fijo,
   * media clase de invierno se correría una hora.
   */
  it("respeta el horario de verano europeo", () => {
    const verano = classInstant(dia("2026-07-15"), "18:30", "Europe/Madrid");
    const invierno = classInstant(dia("2026-12-15"), "18:30", "Europe/Madrid");
    const offsetVerano = verano!.getUTCHours();
    const offsetInvierno = invierno!.getUTCHours();
    expect(offsetVerano).not.toBe(offsetInvierno);
  });

  /**
   * 6 de las 41 cohortes reales no tienen horario cargado. No es un error: es
   * un dato que falta, y la respuesta correcta es `null` para que la pantalla
   * diga "sin horario" en vez de inventar las 00:00.
   */
  it.each([null, "", "  ", "mañana", "25:00", "18:60"])(
    "horario inválido o vacío (%s) devuelve null, no una fecha inventada",
    (hora) => {
      expect(classInstant(dia("2026-03-10"), hora, "America/Montevideo")).toBeNull();
    }
  );

  /** Una zona inexistente no puede tumbar el calendario entero. */
  it("una zona horaria inválida devuelve null en vez de lanzar", () => {
    expect(classInstant(dia("2026-03-10"), "18:30", "Marte/Olympus")).toBeNull();
  });
});

/**
 * 013 (T007, FR-003/FR-005e) — Cuándo se ve el enlace de la reunión.
 *
 * DV-001: desde 15 minutos antes y hasta 30 después del fin, configurable por
 * organización.
 */
describe("meetingLinkVisible — la ventana del enlace", () => {
  const inicio = new Date("2026-03-10T21:30:00.000Z"); // 18:30 en Montevideo
  const fin = new Date("2026-03-10T23:30:00.000Z"); // 20:30
  const ventana = { beforeMin: 15, afterMin: 30 };

  const enMinutos = (base: Date, min: number) =>
    new Date(base.getTime() + min * 60_000);

  it("no se ve una hora antes", () => {
    expect(
      meetingLinkVisible(enMinutos(inicio, -60), inicio, fin, ventana, false)
    ).toBe(false);
  });

  it("no se ve 16 minutos antes (justo afuera)", () => {
    expect(
      meetingLinkVisible(enMinutos(inicio, -16), inicio, fin, ventana, false)
    ).toBe(false);
  });

  it("SÍ se ve 15 minutos antes (justo adentro)", () => {
    expect(
      meetingLinkVisible(enMinutos(inicio, -15), inicio, fin, ventana, false)
    ).toBe(true);
  });

  it("se ve durante la clase", () => {
    expect(meetingLinkVisible(enMinutos(inicio, 30), inicio, fin, ventana, false)).toBe(
      true
    );
  });

  it("SÍ se ve 30 minutos después del fin (justo adentro)", () => {
    expect(meetingLinkVisible(enMinutos(fin, 30), inicio, fin, ventana, false)).toBe(
      true
    );
  });

  it("no se ve 31 minutos después del fin", () => {
    expect(meetingLinkVisible(enMinutos(fin, 31), inicio, fin, ventana, false)).toBe(
      false
    );
  });

  /**
   * FR-005e — Una clase cancelada NO ofrece enlace, aunque el reloj caiga
   * dentro de la ventana. Es el caso que evita que alguien entre a una reunión
   * que no va a existir.
   */
  it("una clase CANCELADA no muestra el enlace ni en pleno horario", () => {
    expect(meetingLinkVisible(enMinutos(inicio, 30), inicio, fin, ventana, true)).toBe(
      false
    );
  });

  /** Sin horario (las 6 cohortes sin `start_time`) no hay ventana posible. */
  it("sin instante de inicio no se muestra nada", () => {
    expect(meetingLinkVisible(new Date(), null, null, ventana, false)).toBe(false);
  });

  /**
   * La ventana es configurable por organización (FR-003): con 0/0 el enlace
   * existe solo mientras dura la clase.
   */
  it("respeta una ventana configurada distinta", () => {
    const cero = { beforeMin: 0, afterMin: 0 };
    expect(meetingLinkVisible(enMinutos(inicio, -1), inicio, fin, cero, false)).toBe(
      false
    );
    expect(meetingLinkVisible(inicio, inicio, fin, cero, false)).toBe(true);
  });

  /**
   * Una clase sin hora de fin: la ventana se mide solo desde el inicio, y no
   * queda abierta para siempre.
   */
  it("sin hora de fin, la ventana se cierra al terminar el margen posterior", () => {
    expect(
      meetingLinkVisible(enMinutos(inicio, 20), inicio, null, ventana, false)
    ).toBe(true);
    expect(
      meetingLinkVisible(enMinutos(inicio, 31), inicio, null, ventana, false)
    ).toBe(false);
  });
});

/**
 * 016 — El plazo ya guardado, de vuelta a los campos con los que se cargó.
 *
 * La planilla ofrece "Cambiar" sobre una fecha límite que ya existe, y para
 * sembrar los campos hay que partir ese instante en el día y la hora de la
 * ACADEMIA. Partirlo con el reloj del navegador es el error de siempre al
 * revés: desde Asunción, un plazo de las 23:59 de Montevideo vuelve como las
 * 22:59, y guardar sin tocar nada le adelanta una hora el plazo a los 87
 * alumnos que cursan desde otro país.
 */
describe("wallClockInZone — el instante, de vuelta a día y hora de pared", () => {
  it("parte el instante en la zona de la academia, no en la de quien mira", () => {
    expect(
      wallClockInZone(new Date("2026-10-02T02:59:00.000Z"), "America/Montevideo")
    ).toEqual({ fecha: "2026-10-01", hora: "23:59" });
  });

  /**
   * La comprobación fuerte, y la que no depende de que yo recuerde ningún
   * offset: es la inversa exacta de `classInstant`. Lo que se compuso con un
   * día y una hora tiene que volver como ese mismo día y esa misma hora.
   */
  it.each([
    ["America/Montevideo", "2026-10-01", "23:59"],
    ["America/Asuncion", "2026-03-10", "18:30"],
    ["America/Santo_Domingo", "2026-07-15", "09:00"],
    // A los dos lados del cambio de horario europeo.
    ["Europe/Madrid", "2026-07-15", "18:30"],
    ["Europe/Madrid", "2026-12-15", "18:30"],
    // Medianoche: la hora en la que `hour12: false` devuelve 24 en varias zonas.
    ["Europe/Madrid", "2026-12-15", "00:00"],
  ])("ida y vuelta con classInstant en %s (%s %s)", (zona, fecha, hora) => {
    const instante = classInstant(dia(fecha), hora, zona);
    expect(wallClockInZone(instante!, zona)).toEqual({ fecha, hora });
  });

  /** Mismo criterio que el resto del módulo: antes nada que un dato inventado. */
  it("una zona inválida devuelve null en vez de lanzar", () => {
    expect(wallClockInZone(new Date("2026-10-01T12:00:00.000Z"), "Marte/Olympus")).toBeNull();
  });

  it("una fecha inválida tampoco inventa un día", () => {
    expect(wallClockInZone(new Date("no es una fecha"), "America/Montevideo")).toBeNull();
  });
});
