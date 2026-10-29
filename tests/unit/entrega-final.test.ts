import { describe, expect, it } from "vitest";
import {
  ENTREGA_FINAL_ANTES_DEL_FIN,
  PLAZO_SUPERA_ENTREGA_FINAL,
  entregaFinalValida,
  instanteDeEntregaFinal,
  periodoDeEntrega,
  plazoDeEvaluacion,
  plazoSuperaEntregaFinal,
  textoDePeriodoDeEntrega,
  validarPedidoDeProrroga,
} from "@/lib/entrega-final";

/**
 * 0083 — La entrega final del grupo: un día de calendario posterior al fin,
 * que heredan las evaluaciones sin plazo propio y que el alumno ve como
 * "En período de entrega" una vez terminadas las clases.
 */

const TZ = "America/Montevideo"; // UTC-3
/** Las columnas de "día" se guardan a medianoche UTC. */
const dia = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

describe("0083 — validación de la entrega final", () => {
  it("tiene que ser ESTRICTAMENTE posterior al fin", () => {
    expect(entregaFinalValida(dia("2026-11-30"), dia("2026-12-15"))).toBe(true);
    expect(entregaFinalValida(dia("2026-11-30"), dia("2026-11-30"))).toBe(false);
    expect(entregaFinalValida(dia("2026-12-01"), dia("2026-11-30"))).toBe(false);
  });

  it("sin fin o sin entrega final no hay nada que comparar", () => {
    expect(entregaFinalValida(null, dia("2026-12-15"))).toBe(true);
    expect(entregaFinalValida(dia("2026-11-30"), null)).toBe(true);
    expect(entregaFinalValida(null, null)).toBe(true);
  });

  it("un día guardado con hora sigue siendo ese día (se compara el calendario)", () => {
    expect(
      entregaFinalValida(new Date("2026-11-30T03:00:00.000Z"), new Date("2026-11-30T01:00:00.000Z"))
    ).toBe(false);
  });

  it("los errores llevan su código", () => {
    expect(ENTREGA_FINAL_ANTES_DEL_FIN.code).toBe("entrega_final_antes_del_fin");
    expect(PLAZO_SUPERA_ENTREGA_FINAL.code).toBe("plazo_supera_entrega_final");
  });
});

describe("0083 — el instante de la entrega final y la herencia", () => {
  it("es las 23:59 del día en la zona de la academia", () => {
    expect(instanteDeEntregaFinal(dia("2026-12-15"), TZ)?.toISOString()).toBe(
      "2026-12-16T02:59:00.000Z"
    );
    expect(instanteDeEntregaFinal(null, TZ)).toBeNull();
  });

  it("la evaluación con plazo propio lo conserva; sin él, hereda la del grupo", () => {
    const propio = new Date("2026-12-01T20:00:00.000Z");
    const final = new Date("2026-12-16T02:59:00.000Z");
    expect(plazoDeEvaluacion(propio, final)).toBe(propio);
    expect(plazoDeEvaluacion(null, final)).toBe(final);
    expect(plazoDeEvaluacion(null, null)).toBeNull();
  });

  it("un plazo posterior a la entrega final se rechaza; igual o anterior, no", () => {
    const final = new Date("2026-12-16T02:59:00.000Z");
    expect(plazoSuperaEntregaFinal(new Date("2026-12-16T03:00:00.000Z"), final)).toBe(true);
    expect(plazoSuperaEntregaFinal(final, final)).toBe(false);
    expect(plazoSuperaEntregaFinal(new Date("2026-12-01T00:00:00.000Z"), final)).toBe(false);
    expect(plazoSuperaEntregaFinal(new Date("2030-01-01T00:00:00.000Z"), null)).toBe(false);
    expect(plazoSuperaEntregaFinal(null, final)).toBe(false);
  });
});

describe("0083 — En período de entrega", () => {
  const base = {
    endDate: dia("2026-11-30"),
    ultimaClase: { date: dia("2026-11-30"), endTime: "21:00" },
    entregaFinal: instanteDeEntregaFinal(dia("2026-12-15"), TZ),
    prorrogas: [] as Date[],
  };

  it("terminadas las clases y antes de la entrega final: en período, hasta la entrega", () => {
    const p = periodoDeEntrega(base, TZ, new Date("2026-12-05T15:00:00.000Z"));
    expect(p).toEqual({ hasta: "2026-12-16T02:59:00.000Z" });
  });

  it("mientras haya clases no está en período de entrega", () => {
    expect(periodoDeEntrega(base, TZ, new Date("2026-11-30T15:00:00.000Z"))).toBeNull();
  });

  it("sin fin declarado, manda la última clase (terminada)", () => {
    const sinFin = { ...base, endDate: null };
    // 30/11 a las 22:00 de Montevideo: la clase de las 21:00 ya terminó.
    expect(periodoDeEntrega(sinFin, TZ, new Date("2026-12-01T01:00:00.000Z"))).not.toBeNull();
    // 30/11 a las 20:00: todavía no.
    expect(periodoDeEntrega(sinFin, TZ, new Date("2026-11-30T23:00:00.000Z"))).toBeNull();
  });

  it("pasada la entrega final, ya no", () => {
    expect(periodoDeEntrega(base, TZ, new Date("2026-12-16T03:00:00.000Z"))).toBeNull();
  });

  it("la prórroga aprobada del alumno lo estira: hasta la más tardía", () => {
    const conProrroga = { ...base, prorrogas: [new Date("2026-12-20T02:59:00.000Z")] };
    expect(periodoDeEntrega(conProrroga, TZ, new Date("2026-12-18T12:00:00.000Z"))).toEqual({
      hasta: "2026-12-20T02:59:00.000Z",
    });
  });

  it("una prórroga anterior a la entrega final no la acorta", () => {
    const conProrroga = { ...base, prorrogas: [new Date("2026-12-10T02:59:00.000Z")] };
    expect(periodoDeEntrega(conProrroga, TZ, new Date("2026-12-12T12:00:00.000Z"))).toEqual({
      hasta: "2026-12-16T02:59:00.000Z",
    });
  });

  it("sin entrega final del grupo no hay período, aunque haya una prórroga", () => {
    expect(
      periodoDeEntrega(
        { ...base, entregaFinal: null, prorrogas: [new Date("2026-12-20T02:59:00.000Z")] },
        TZ,
        new Date("2026-12-05T15:00:00.000Z")
      )
    ).toBeNull();
  });

  it("sin fin ni clases no se sabe si terminó: no se afirma nada", () => {
    expect(
      periodoDeEntrega(
        { ...base, endDate: null, ultimaClase: null },
        TZ,
        new Date("2026-12-05T15:00:00.000Z")
      )
    ).toBeNull();
  });

  it("el texto dice el día en la zona de la academia", () => {
    expect(textoDePeriodoDeEntrega("2026-12-16T02:59:00.000Z", TZ)).toBe(
      "En período de entrega · hasta el 15/12"
    );
  });
});

describe("0083 — el pedido de prórroga del alumno", () => {
  const ahora = new Date("2026-12-01T12:00:00.000Z");
  const vigente = new Date("2026-12-16T02:59:00.000Z");

  it("pide motivo", () => {
    expect(
      validarPedidoDeProrroga({ solicitada: new Date("2026-12-20T02:59:00.000Z"), vigente, motivo: "  " }, ahora)
    ).toMatchObject({ code: "motivo_requerido" });
  });

  it("la fecha pedida tiene que ser posterior al plazo vigente", () => {
    expect(validarPedidoDeProrroga({ solicitada: vigente, vigente, motivo: "Viaje" }, ahora)).toMatchObject({
      code: "fecha_no_posterior",
    });
    expect(
      validarPedidoDeProrroga(
        { solicitada: new Date("2026-12-20T02:59:00.000Z"), vigente, motivo: "Viaje" },
        ahora
      )
    ).toBeNull();
  });

  it("sin plazo vigente, al menos posterior a ahora", () => {
    expect(
      validarPedidoDeProrroga(
        { solicitada: new Date("2026-11-30T00:00:00.000Z"), vigente: null, motivo: "Viaje" },
        ahora
      )
    ).toMatchObject({ code: "fecha_no_posterior" });
    expect(
      validarPedidoDeProrroga(
        { solicitada: new Date("2026-12-05T00:00:00.000Z"), vigente: null, motivo: "Viaje" },
        ahora
      )
    ).toBeNull();
  });

  it("una fecha que no se entiende es inválida", () => {
    expect(validarPedidoDeProrroga({ solicitada: null, vigente, motivo: "Viaje" }, ahora)).toMatchObject({
      code: "invalid_due_at",
    });
  });
});
