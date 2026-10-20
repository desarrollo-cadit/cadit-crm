import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { formatCalendarDay } from "@/lib/utils";
import { conZona, etiquetaDeZona, ultimoDiaDelPlazo } from "@/lib/schedule-time";

/**
 * 2026-10-20 — Fechas corridas un día y horas sin zona.
 *
 * Los DÍAS de calendario (inicio y fin de cohorte, fecha de clase, vencimiento
 * de cuota, fecha de pago, acceso hasta…) se guardan a medianoche UTC. Leídos
 * en la zona de quien mira, en Uruguay (UTC-3) son las 21:00 del día ANTERIOR:
 * "AutoCAD 2D" empieza el 9 de noviembre y Académico decía "8 nov".
 */

const ZONA_ORIGINAL = process.env.TZ;

describe("formatCalendarDay — un día de calendario no depende de la zona de quien mira", () => {
  beforeEach(() => {
    // La zona de quien mira el panel desde Montevideo.
    process.env.TZ = "America/Montevideo";
  });
  afterEach(() => {
    process.env.TZ = ZONA_ORIGINAL;
  });

  it("el inicio de cohorte 2026-11-09 dice 09 nov, no 08", () => {
    const texto = formatCalendarDay("2026-11-09T00:00:00.000Z", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    expect(texto).toMatch(/^09/);
    expect(texto.toLowerCase()).toContain("nov");
    expect(texto).toContain("2026");
  });

  it("también desde una zona al este de Greenwich (Madrid)", () => {
    process.env.TZ = "Europe/Madrid";
    expect(
      formatCalendarDay("2026-11-09T00:00:00.000Z", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    ).toBe("09/11/2026");
  });

  it("acepta un Date (texto del servidor: correos, estado de cuenta)", () => {
    expect(
      formatCalendarDay(new Date("2026-01-01T00:00:00.000Z"), {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    ).toBe("01/01/2026");
  });

  it("ignora una zona que alguien le pase: el día siempre se lee en UTC", () => {
    expect(
      formatCalendarDay("2026-11-09T00:00:00.000Z", {
        day: "numeric",
        timeZone: "America/Montevideo",
      })
    ).toBe("9");
  });
});

describe("ultimoDiaDelPlazo — un plazo que vence AL FINAL de un día de la academia", () => {
  /**
   * El vencimiento de las licencias del grupo se guarda como el instante en
   * que TERMINA el día elegido en la academia (`classEndsAt`): el 31/03 se
   * guarda como 01/04 00:00 de Montevideo. Mostrarlo tal cual dice "1/4".
   */
  it("el 31 de marzo elegido vuelve como 31 de marzo", () => {
    const fin = new Date("2027-04-01T03:00:00.000Z"); // 01/04 00:00 en Montevideo
    expect(ultimoDiaDelPlazo(fin, "America/Montevideo")).toBe("2027-03-31");
  });

  it("fecha inválida → null", () => {
    expect(ultimoDiaDelPlazo(new Date("x"), "America/Montevideo")).toBeNull();
  });
});

describe("etiquetaDeZona — la zona de la academia dicha como una persona", () => {
  it.each([
    ["America/Montevideo", "hora de Uruguay"],
    ["America/Asuncion", "hora de Paraguay"],
    ["America/Santo_Domingo", "hora de República Dominicana"],
    ["Europe/Madrid", "hora de España"],
    ["America/Argentina/Buenos_Aires", "hora de Argentina"],
  ])("%s → %s", (zona, etiqueta) => {
    expect(etiquetaDeZona(zona)).toBe(etiqueta);
  });

  it("una zona sin nombre propio cae a la ciudad del identificador", () => {
    expect(etiquetaDeZona("America/Costa_Rica")).toBe("hora de Costa Rica");
  });

  it("vacía → hora de la academia", () => {
    expect(etiquetaDeZona("")).toBe("hora de la academia");
  });
});

describe("conZona — una hora o un horario, con la zona dicha", () => {
  it("una hora suelta", () => {
    expect(conZona("15:00", "America/Montevideo")).toBe("15:00 (hora de Uruguay)");
  });

  it("el horario de texto libre de la cohorte", () => {
    expect(conZona("martes y jueves de 18:30 a 20:30", "America/Montevideo")).toBe(
      "martes y jueves de 18:30 a 20:30 (hora de Uruguay)"
    );
  });
});
