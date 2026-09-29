import { describe, expect, it } from "vitest";
import { estadoDeTramo, resumenDeCadena } from "@/components/portal/campus";

/**
 * El progreso de un curso, contado clase por clase.
 *
 * Lo que se prueba acá es lo que no se ve en una captura: qué estado toma una
 * clase sin lista y qué escucha quien usa un lector de pantalla. Un error en
 * cualquiera de las dos cosas le dice a una persona algo falso sobre su
 * propio curso.
 */

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
