import { describe, expect, it } from "vitest";
import { formatDuration } from "@/lib/duration";
import { paginationItems } from "@/lib/pagination";

/**
 * 030 (addendum, pedido del dueño: "no es tabla realmente, no tiene
 * paginación") — Las piezas puras de la tabla de grabaciones: la duración
 * legible y la botonera numerada.
 */

describe("duración legible", () => {
  it("horas y minutos como se dicen", () => {
    expect(formatDuration(112)).toBe("1 h 52 min");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(45)).toBe("45 min");
    expect(formatDuration(0)).toBe("0 min");
  });
  it("sin dato, sin número inventado", () => {
    expect(formatDuration(null)).toBeNull();
    expect(formatDuration(-3)).toBeNull();
  });
});

describe("botonera numerada", () => {
  it("pocas páginas: todas", () => {
    expect(paginationItems(1, 1)).toEqual([1]);
    expect(paginationItems(3, 5)).toEqual([1, 2, 3, 4, 5]);
  });
  it("muchas: primera, vecinas de la actual y última, con elipsis", () => {
    expect(paginationItems(1, 20)).toEqual([1, 2, 3, "…", 20]);
    expect(paginationItems(10, 20)).toEqual([1, "…", 9, 10, 11, "…", 20]);
    expect(paginationItems(20, 20)).toEqual([1, "…", 18, 19, 20]);
    // un hueco de UNA página no se esconde detrás de una elipsis
    expect(paginationItems(4, 20)).toEqual([1, 2, 3, 4, 5, "…", 20]);
  });
});
