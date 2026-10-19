import { describe, expect, it } from "vitest";
import {
  DIAS_DE_AVISO,
  avisoDeAcceso,
  accesoTerminaEn,
  diaCalendario,
  esDiaValido,
  estadoDeAcceso,
  formatearDia,
  hoyEnZona,
  maxDia,
  referenciaDeCohorte,
  referenciaDeRecorrido,
  sumarMeses,
  type CohorteFechas,
} from "@/lib/access-expiry";

/**
 * 043 — El acceso a los contenidos de una cohorte vence un mes calendario
 * después de que la cohorte termina. Todo se calcula al LEER, a partir de
 * fechas: nada que revocar, nada que un cron tenga que acordarse de hacer.
 */

const TZ = "America/Montevideo";
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);
const cohorte = (
  id: string,
  endDate: string | null,
  lastClassDate: string | null = null
): CohorteFechas => ({
  id,
  endDate: endDate ? dia(endDate) : null,
  lastClassDate: lastClassDate ? dia(lastClassDate) : null,
});

describe("043 — fechas de calendario", () => {
  it("lee el día de un timestamp en UTC (el día viaja como medianoche UTC)", () => {
    expect(diaCalendario(dia("2026-10-14"))).toBe("2026-10-14");
    // Un día guardado con hora (importaciones viejas) sigue siendo ese día.
    expect(diaCalendario(new Date("2026-10-14T03:00:00.000Z"))).toBe("2026-10-14");
  });

  it("valida YYYY-MM-DD de verdad (no acepta 2026-02-30)", () => {
    expect(esDiaValido("2026-02-28")).toBe(true);
    expect(esDiaValido("2028-02-29")).toBe(true);
    expect(esDiaValido("2026-02-29")).toBe(false);
    expect(esDiaValido("2026-13-01")).toBe(false);
    expect(esDiaValido("26-1-1")).toBe(false);
    expect(esDiaValido("")).toBe(false);
  });

  it("sumarMeses es un mes CALENDARIO y se recorta al último día del mes", () => {
    expect(sumarMeses("2026-10-14", 1)).toBe("2026-11-14");
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2028-01-31", 1)).toBe("2028-02-29");
    expect(sumarMeses("2026-03-31", 1)).toBe("2026-04-30");
    expect(sumarMeses("2026-08-31", 1)).toBe("2026-09-30");
    expect(sumarMeses("2026-12-15", 1)).toBe("2027-01-15");
    expect(sumarMeses("2026-12-31", 1)).toBe("2027-01-31");
  });

  it("maxDia ignora null", () => {
    expect(maxDia(["2026-01-02", null, "2026-03-01", "2025-12-31"])).toBe("2026-03-01");
    expect(maxDia([null, null])).toBeNull();
    expect(maxDia([])).toBeNull();
  });

  it("hoyEnZona es el día de pared de la academia", () => {
    // 01:00 UTC del 1° de noviembre = 22:00 del 31 de octubre en Montevideo.
    expect(hoyEnZona(new Date("2026-11-01T01:00:00.000Z"), TZ)).toBe("2026-10-31");
    expect(hoyEnZona(new Date("2026-11-01T04:00:00.000Z"), TZ)).toBe("2026-11-01");
  });

  it("formatea un día sin correrlo por la zona de quien mira", () => {
    expect(formatearDia("2026-11-14")).toBe("14 de noviembre de 2026");
    expect(formatearDia("2027-01-01")).toBe("1 de enero de 2027");
  });
});

describe("043 — la fecha de referencia", () => {
  it("cohorte: end_date si existe", () => {
    expect(referenciaDeCohorte(cohorte("a", "2026-09-30", "2026-09-25"))).toBe("2026-09-30");
  });

  it("cohorte: sin end_date, la última clase no cancelada", () => {
    expect(referenciaDeCohorte(cohorte("a", null, "2026-09-25"))).toBe("2026-09-25");
  });

  it("cohorte: sin ninguna de las dos, no hay fecha (no vence)", () => {
    expect(referenciaDeCohorte(cohorte("a", null, null))).toBeNull();
  });

  it("cursada simple: la de su cohorte", () => {
    expect(
      referenciaDeRecorrido({ cohorte: cohorte("a", "2026-09-30"), esPrograma: false, modulos: [] })
    ).toBe("2026-09-30");
    expect(referenciaDeRecorrido({ cohorte: null, esPrograma: false, modulos: [] })).toBeNull();
  });

  it("especialización: el ÚLTIMO módulo que termina, no el primero", () => {
    expect(
      referenciaDeRecorrido({
        cohorte: cohorte("madre", null),
        esPrograma: true,
        modulos: [
          cohorte("m1", "2026-03-31"),
          cohorte("m2", null, "2026-06-20"),
          cohorte("m3", "2026-09-15"),
        ],
      })
    ).toBe("2026-09-15");
  });

  it("especialización: la fecha declarada en la madre cuenta si es posterior", () => {
    expect(
      referenciaDeRecorrido({
        cohorte: cohorte("madre", "2026-12-01"),
        esPrograma: true,
        modulos: [cohorte("m1", "2026-03-31"), cohorte("m2", "2026-09-15")],
      })
    ).toBe("2026-12-01");
  });

  it("especialización: un módulo sin fecha deja al programa sin fin calculable", () => {
    expect(
      referenciaDeRecorrido({
        cohorte: cohorte("madre", "2026-12-01"),
        esPrograma: true,
        modulos: [cohorte("m1", "2026-03-31"), cohorte("m2", null, null)],
      })
    ).toBeNull();
  });

  it("especialización todavía sin módulos: la fecha de la madre", () => {
    expect(
      referenciaDeRecorrido({ cohorte: cohorte("madre", "2026-12-01"), esPrograma: true, modulos: [] })
    ).toBe("2026-12-01");
    expect(
      referenciaDeRecorrido({ cohorte: cohorte("madre", null), esPrograma: true, modulos: [] })
    ).toBeNull();
  });
});

describe("043 — el estado del acceso", () => {
  it("vence al terminar el día límite en la zona de la academia", () => {
    // Límite 2026-11-14 → termina a las 00:00 del 15 en Montevideo (03:00 UTC).
    expect(accesoTerminaEn("2026-11-14", TZ).toISOString()).toBe("2026-11-15T03:00:00.000Z");
  });

  it("calculado: un mes después de la referencia; vigente hasta el último minuto del día", () => {
    const antes = estadoDeAcceso(
      { referencia: "2026-10-14", override: null },
      new Date("2026-11-15T02:59:00.000Z"),
      TZ
    );
    expect(antes).toMatchObject({ hasta: "2026-11-14", origen: "calculado", vencido: false });

    const despues = estadoDeAcceso(
      { referencia: "2026-10-14", override: null },
      new Date("2026-11-15T03:00:00.000Z"),
      TZ
    );
    expect(despues.vencido).toBe(true);
  });

  it("31 de enero → 28 de febrero", () => {
    const e = estadoDeAcceso({ referencia: "2026-01-31", override: null }, dia("2026-02-01"), TZ);
    expect(e.hasta).toBe("2026-02-28");
  });

  it("la fecha manual REEMPLAZA a la calculada, más tarde o más temprano", () => {
    const ahora = dia("2026-11-20");
    const extendida = estadoDeAcceso({ referencia: "2026-09-01", override: "2026-12-31" }, ahora, TZ);
    expect(extendida).toMatchObject({
      hasta: "2026-12-31",
      calculada: "2026-10-01",
      origen: "manual",
      vencido: false,
    });

    const acortada = estadoDeAcceso({ referencia: "2026-11-01", override: "2026-11-05" }, ahora, TZ);
    expect(acortada).toMatchObject({ hasta: "2026-11-05", calculada: "2026-12-01", vencido: true });
  });

  it("sin referencia ni fecha manual: no vence", () => {
    const e = estadoDeAcceso({ referencia: null, override: null }, dia("2030-01-01"), TZ);
    expect(e).toMatchObject({ hasta: null, origen: "sin_fecha", vencido: false, terminaEn: null });
  });

  it("sin referencia pero con fecha manual: vale la manual", () => {
    const e = estadoDeAcceso({ referencia: null, override: "2026-01-10" }, dia("2026-02-01"), TZ);
    expect(e).toMatchObject({ hasta: "2026-01-10", origen: "manual", vencido: true });
  });
});

describe("043 — el aviso al alumno", () => {
  const estado = (hasta: string | null, vencido: boolean) => ({
    hasta,
    calculada: hasta,
    referencia: null,
    origen: hasta ? ("calculado" as const) : ("sin_fecha" as const),
    vencido,
    terminaEn: hasta ? accesoTerminaEn(hasta, TZ).toISOString() : null,
  });

  it("vencido: «finalizado» con la fecha", () => {
    expect(avisoDeAcceso(estado("2026-10-01", true), dia("2026-10-19"))).toEqual({
      tipo: "finalizado",
      hasta: "2026-10-01",
    });
  });

  it(`dentro de los últimos ${DIAS_DE_AVISO} días: «hasta»`, () => {
    expect(avisoDeAcceso(estado("2026-11-14", false), dia("2026-10-19"))).toEqual({
      tipo: "hasta",
      hasta: "2026-11-14",
    });
  });

  it("lejos del corte o sin fecha: nada", () => {
    expect(avisoDeAcceso(estado("2027-03-01", false), dia("2026-10-19"))).toBeNull();
    expect(avisoDeAcceso(estado(null, false), dia("2026-10-19"))).toBeNull();
  });
});
