import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coincideFilaDeFinanzas, conteoDeFilas } from "@/lib/finanzas-filters";

/** 2026-10-30 — La búsqueda de Finanzas: esconde filas, nunca cambia totales. */
const fila = (alumno: string, cohorte = "Octubre", curso = "Revit") => ({ alumno, cohorte, curso });

describe("coincideFilaDeFinanzas", () => {
  it("cada palabra en alumno, grupo o curso, sin tildes ni mayúsculas", () => {
    expect(coincideFilaDeFinanzas(fila("Ana Pérez"), "perez revit")).toBe(true);
    expect(coincideFilaDeFinanzas(fila("Ana Pérez"), "octubre")).toBe(true);
    expect(coincideFilaDeFinanzas(fila("Ana Pérez"), "bruno")).toBe(false);
    expect(coincideFilaDeFinanzas(fila("Ana Pérez"), "")).toBe(true);
  });
});

describe("conteoDeFilas", () => {
  const bloques = [
    { filas: [fila("Ana Pérez"), fila("Bruno Gómez")] },
    { filas: [fila("Ana Ruiz", "Noviembre", "AutoCAD")] },
  ];

  it("suma las filas de todas las monedas", () => {
    expect(conteoDeFilas(bloques, "")).toEqual({ mostrando: 3, total: 3 });
  });

  it("cuenta las que se ven con la búsqueda", () => {
    expect(conteoDeFilas(bloques, "ana")).toEqual({ mostrando: 2, total: 3 });
    expect(conteoDeFilas([], "ana")).toEqual({ mostrando: 0, total: 0 });
  });
});

describe("la pantalla", () => {
  const src = readFileSync("src/components/finanzas/finanzas-client.tsx", "utf8");

  it("los totales de cada bloque salen del servidor, no de las filas filtradas", () => {
    expect(src).toContain("miles(bloque.total, bloque.currency)");
    expect(src).toContain("miles(bloque.totalEmitido, bloque.currency)");
    expect(src).not.toMatch(/filter\(filtra\)\.reduce/);
  });

  it("las pestañas siguen en la URL", () => {
    expect(src).toContain("usePestanaEnUrl<PestanaFinanzas>");
  });
});
