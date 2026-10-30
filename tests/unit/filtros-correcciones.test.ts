import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  SIN_FILTROS_DE_CORRECCIONES,
  filtrarCorrecciones,
  opcionesDeCorrecciones,
} from "@/lib/correction-filters";

/** 2026-10-30 — La bandeja de Correcciones: búsqueda y desplegables con cantidades. */
const item = (id: string, studentName: string, assessmentName: string, cohortId: string, cohortName: string) => ({
  id,
  studentName,
  assessmentName,
  cohortId,
  cohortName,
});

const items = [
  item("a", "Ana Pérez", "Entrega final", "coh_1", "Revit Octubre"),
  item("b", "Bruno Gómez", "Parcial 1", "coh_1", "Revit Octubre"),
  item("c", "Carla Ríos", "Entrega final", "coh_2", "AutoCAD Noviembre"),
];
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe("filtrarCorrecciones", () => {
  it("sin filtros, todas en el orden recibido", () => {
    expect(ids(filtrarCorrecciones(items, SIN_FILTROS_DE_CORRECCIONES))).toEqual(["a", "b", "c"]);
  });

  it("busca alumno, evaluación y grupo sin tildes", () => {
    const con = (busqueda: string) => ids(filtrarCorrecciones(items, { ...SIN_FILTROS_DE_CORRECCIONES, busqueda }));
    expect(con("rios")).toEqual(["c"]);
    expect(con("parcial")).toEqual(["b"]);
    expect(con("revit entrega")).toEqual(["a"]);
  });

  it("la evaluación se elige por nombre y cruza grupos", () => {
    expect(
      ids(filtrarCorrecciones(items, { ...SIN_FILTROS_DE_CORRECCIONES, evaluacion: "Entrega final" }))
    ).toEqual(["a", "c"]);
    expect(
      ids(filtrarCorrecciones(items, { busqueda: "", cohortId: "coh_2", evaluacion: "Entrega final" }))
    ).toEqual(["c"]);
  });
});

describe("opcionesDeCorrecciones", () => {
  it("ofrece todos los grupos y evaluaciones, ordenados por nombre", () => {
    const o = opcionesDeCorrecciones(items, SIN_FILTROS_DE_CORRECCIONES);
    expect(o.grupos.map((g) => g.etiqueta)).toEqual(["AutoCAD Noviembre", "Revit Octubre"]);
    expect(o.evaluaciones.map((e) => [e.etiqueta, e.cantidad])).toEqual([
      ["Entrega final", 2],
      ["Parcial 1", 1],
    ]);
    expect(o.todosLosGrupos).toBe(3);
  });

  it("cada cantidad cuenta con los demás filtros y sin el suyo; filtrar no borra opciones", () => {
    const o = opcionesDeCorrecciones(items, { busqueda: "", cohortId: "coh_1", evaluacion: "Entrega final" });
    expect(o.grupos.map((g) => [g.clave, g.cantidad])).toEqual([
      ["coh_2", 1],
      ["coh_1", 1],
    ]);
    expect(o.todosLosGrupos).toBe(2);
    expect(o.evaluaciones.map((e) => [e.clave, e.cantidad])).toEqual([
      ["Entrega final", 1],
      ["Parcial 1", 1],
    ]);
    expect(o.todasLasEvaluaciones).toBe(2);
  });
});

describe("la bandeja", () => {
  const src = readFileSync("src/components/grading/correction-inbox.tsx", "utf8");

  it("conserva aprobar y devolver, y el marcador de cada tarjeta", () => {
    expect(src).toContain("/approve");
    expect(src).toContain("/return");
    expect(src).toContain("data-correction-id={i.id}");
    expect(src).toContain("<SinCoincidencias");
  });
});
