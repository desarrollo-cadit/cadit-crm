import { describe, expect, it } from "vitest";
import {
  debeRotular,
  estadoDeTramo,
  resumenDeCadena,
} from "@/components/portal/plano";

/**
 * La cadena de cotas: el avance de una cursada contado clase por clase.
 *
 * Lo que se prueba acá es lo que no se ve en una captura: qué números se
 * rotulan cuando no entran todos, qué estado toma un tramo sin lista, y qué
 * escucha quien usa un lector de pantalla. Un error en cualquiera de las tres
 * cosas le dice a una persona algo falso sobre su propia cursada.
 */

describe("debeRotular — qué números de clase se escriben", () => {
  const rotulados = (total: number, next: number | null = null) =>
    Array.from({ length: total }, (_, i) => i + 1).filter((n) => debeRotular(n, total, next));

  it("hasta 16 clases, todas llevan su número", () => {
    expect(rotulados(12)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("entre 17 y 32, van de a dos, más la primera y la última", () => {
    expect(rotulados(20)).toEqual([1, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it("con muchas clases van de a cinco, sin pisar el último número", () => {
    // 36 clases: el 35 quedaría pegado al 36 y se omite.
    expect(rotulados(36)).toEqual([1, 5, 10, 15, 20, 25, 30, 36]);
  });

  it("la clase que sigue siempre lleva su número, aunque no le toque", () => {
    expect(rotulados(36, 17)).toContain(17);
  });
});

describe("estadoDeTramo — qué dibuja cada clase", () => {
  it("con lista, cada clase dice lo que pasó", () => {
    const estados = ["asistio", "falto", "sin_registro"] as const;
    expect(estadoDeTramo(1, [...estados], 3)).toBe("falto");
    expect(estadoDeTramo(2, [...estados], 3)).toBe("sin_registro");
  });

  it("sin lista, la cadena mide el cronograma: dictada o por venir", () => {
    expect(estadoDeTramo(0, undefined, 2)).toBe("asistio");
    expect(estadoDeTramo(1, undefined, 2)).toBe("asistio");
    expect(estadoDeTramo(2, undefined, 2)).toBe("futura");
  });
});

describe("resumenDeCadena — lo que escucha un lector de pantalla", () => {
  it("sin lista, cuenta clases dictadas y anuncia la siguiente", () => {
    expect(resumenDeCadena({ total: 12, hechas: 6, next: 7 })).toBe(
      "Clase 6 de 12; la siguiente es la 7"
    );
  });

  it("con lista, cada clase está contada en algún estado", () => {
    const resumen = resumenDeCadena({
      total: 6,
      hechas: 0,
      states: ["asistio", "asistio", "falto", "justificada", "cancelada", "sin_registro"],
    });
    expect(resumen).toBe(
      "De 6 clases: asististe a 2, faltaste a 1, 1 justificada, 1 cancelada, 1 sin registrar"
    );
  });

  it("no nombra los estados que no ocurrieron", () => {
    const resumen = resumenDeCadena({ total: 3, hechas: 0, states: ["asistio", "futura", "futura"] });
    expect(resumen).toBe("De 3 clases: asististe a 1, 2 por dictar");
  });
});
