import { describe, expect, it } from "vitest";
import {
  TODOS_LOS_ANIOS,
  contadoresDeTalleres,
  filtrarTalleres,
  seccionesDeTalleres,
} from "@/lib/workshop-filters";

type Fila = {
  id: string;
  nombre: string;
  modalidad: string;
  startDate: string;
  endDate: string | null;
  started: boolean;
};

const fila = (id: string, nombre: string, fecha: string, started = false, modalidad = "Online"): Fila => ({
  id,
  nombre,
  modalidad,
  startDate: `${fecha}T00:00:00.000Z`,
  endDate: null,
  started,
});

const textos = (f: Fila) => [f.nombre, f.modalidad];

const FILAS = [
  fila("a", "Introducción a Revit", "2026-11-10"),
  fila("b", "Diseño paramétrico", "2026-03-05", true, "Presencial"),
  fila("c", "Revit avanzado", "2025-06-01", true),
];

const ids = (xs: readonly Fila[]) => xs.map((x) => x.id);

describe("filtrarTalleres", () => {
  it("sin búsqueda ni año devuelve todo, en el mismo orden", () => {
    expect(ids(filtrarTalleres(FILAS, { busqueda: "", anio: TODOS_LOS_ANIOS }, textos))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("busca sin tildes ni mayúsculas y cada palabra en algún texto de la fila", () => {
    expect(ids(filtrarTalleres(FILAS, { busqueda: "REVIT", anio: TODOS_LOS_ANIOS }, textos))).toEqual([
      "a",
      "c",
    ]);
    expect(ids(filtrarTalleres(FILAS, { busqueda: "introduccion", anio: TODOS_LOS_ANIOS }, textos))).toEqual([
      "a",
    ]);
    // Una palabra en el nombre y otra en la modalidad.
    expect(ids(filtrarTalleres(FILAS, { busqueda: "diseño presencial", anio: TODOS_LOS_ANIOS }, textos))).toEqual([
      "b",
    ]);
  });

  it("combina búsqueda y año", () => {
    expect(ids(filtrarTalleres(FILAS, { busqueda: "revit", anio: 2025 }, textos))).toEqual(["c"]);
    expect(filtrarTalleres(FILAS, { busqueda: "paramétrico", anio: 2025 }, textos)).toEqual([]);
  });

  it("un texto ausente (null) no rompe ni coincide", () => {
    const conNull = (f: Fila) => [f.nombre, null, undefined];
    expect(ids(filtrarTalleres(FILAS, { busqueda: "online", anio: TODOS_LOS_ANIOS }, conNull))).toEqual([]);
  });
});

describe("seccionesDeTalleres", () => {
  it("separa próximos (sin empezar) de realizados", () => {
    const { proximos, realizados } = seccionesDeTalleres(FILAS);
    expect(ids(proximos)).toEqual(["a"]);
    expect(ids(realizados)).toEqual(["b", "c"]);
  });
});

describe("contadoresDeTalleres", () => {
  it("cuenta por año con la búsqueda aplicada e incluye el año actual aunque esté vacío", () => {
    const c = contadoresDeTalleres(FILAS, "revit", textos, 2027);
    expect(c.todosLosAnios).toBe(2);
    expect(c.anios).toEqual([
      { anio: 2027, count: 0 },
      { anio: 2026, count: 1 },
      { anio: 2025, count: 1 },
    ]);
  });

  it("los años ofrecidos no desaparecen mientras se busca", () => {
    const c = contadoresDeTalleres(FILAS, "nada que coincida", textos, 2026);
    expect(c.todosLosAnios).toBe(0);
    expect(c.anios.map((a) => a.anio)).toEqual([2026, 2025]);
  });
});
