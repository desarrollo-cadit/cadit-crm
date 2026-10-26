import { describe, expect, it } from "vitest";
import {
  TODOS_LOS_ANIOS,
  coincideCohorteConBusqueda,
  contadoresDeCohortes,
  contarCursosPorTipo,
  filtrarCohortes,
  filtrarCursos,
} from "@/lib/academic-filters";
import type { CourseKind } from "@/lib/course-kind";

/**
 * 2026-10-26 — El buscador de Académico. La regla de coincidencia es la de la
 * búsqueda de contactos (`coincideConBusqueda`): cada palabra en algún campo,
 * en cualquier orden, sin tildes ni mayúsculas. Se aplica JUNTO con los demás
 * filtros, y los contadores la reflejan.
 */

type Estado = "planificada" | "en_curso" | "finalizada";

type C = {
  id: string;
  name: string | null;
  courseName: string;
  courseKind: CourseKind;
  isSpecialization: boolean;
  parentCohortId: string | null;
  position: number | null;
  startDate: string;
  endDate: string | null;
  status: Estado;
  teacher: { name: string } | null;
};

function cohorte(id: string, p: Partial<C> = {}): C {
  return {
    id,
    name: id,
    courseName: "Curso",
    courseKind: "curso",
    isSpecialization: false,
    parentCohortId: null,
    position: null,
    startDate: "2026-03-01T00:00:00.000Z",
    endDate: "2026-06-30T00:00:00.000Z",
    status: "en_curso",
    teacher: null,
    ...p,
  };
}

const TODOS_ESTADOS = new Set<Estado>(["planificada", "en_curso", "finalizada"]);
const TODOS_TIPOS = new Set<CourseKind>(["curso", "modulo", "taller"]);
const sinFiltro = { estados: TODOS_ESTADOS, anio: TODOS_LOS_ANIOS, tipos: TODOS_TIPOS };
const ids = (g: { cohort: { id: string } }[]) => g.map((x) => x.cohort.id).sort();

const lista = [
  cohorte("noche", {
    name: "Revit Arquitectura — Grupo Noche",
    courseName: "Revit Arquitectura",
    teacher: { name: "Martín Silva" },
  }),
  cohorte("tarde", {
    name: "AutoCAD 2D — Grupo Tarde",
    courseName: "AutoCAD 2D",
    teacher: { name: "Lucía Pereira" },
    status: "planificada",
  }),
  cohorte("dynamo", {
    name: "Taller de Dynamo",
    courseName: "Dynamo para Revit",
    courseKind: "taller",
    teacher: { name: "Sofía Rodríguez" },
    status: "finalizada",
  }),
];

describe("buscar grupos: nombre, curso y profesor", () => {
  it("por el nombre del grupo", () => {
    expect(ids(filtrarCohortes(lista, { ...sinFiltro, busqueda: "noche" }))).toEqual(["noche"]);
  });

  it("por el nombre del curso", () => {
    expect(ids(filtrarCohortes(lista, { ...sinFiltro, busqueda: "autocad" }))).toEqual(["tarde"]);
  });

  it("por el profesor, sin tildes ni mayúsculas", () => {
    expect(ids(filtrarCohortes(lista, { ...sinFiltro, busqueda: "LUCIA" }))).toEqual(["tarde"]);
    expect(ids(filtrarCohortes(lista, { ...sinFiltro, busqueda: "martin" }))).toEqual(["noche"]);
  });

  it("cada palabra en algún campo, en cualquier orden", () => {
    // "silva" es del profesor y "revit" del curso: las dos tienen que estar.
    expect(ids(filtrarCohortes(lista, { ...sinFiltro, busqueda: "silva revit" }))).toEqual([
      "noche",
    ]);
    // "Revit" está en dos grupos, "noche" en uno solo.
    expect(ids(filtrarCohortes(lista, { ...sinFiltro, busqueda: "revit" }))).toEqual([
      "dynamo",
      "noche",
    ]);
    expect(filtrarCohortes(lista, { ...sinFiltro, busqueda: "revit pereira" })).toEqual([]);
  });

  it("vacía o solo espacios no filtra", () => {
    expect(filtrarCohortes(lista, { ...sinFiltro, busqueda: "   " })).toHaveLength(3);
    expect(filtrarCohortes(lista, sinFiltro)).toHaveLength(3);
  });

  it("se combina con estado, año y tipo", () => {
    expect(
      filtrarCohortes(lista, {
        ...sinFiltro,
        estados: new Set<Estado>(["en_curso"]),
        busqueda: "revit",
      }).map((g) => g.cohort.id)
    ).toEqual(["noche"]);
    expect(
      filtrarCohortes(lista, { ...sinFiltro, tipos: new Set(["curso"]), busqueda: "dynamo" })
    ).toEqual([]);
  });

  it("una especialización aparece si ella o un módulo coincide, con TODOS sus módulos", () => {
    const madre = cohorte("madre", {
      name: "Especialización BIM — Grupo 4",
      courseName: "Especialización BIM",
      isSpecialization: true,
    });
    const m1 = cohorte("m1", {
      name: "Revit MEP",
      courseName: "Revit MEP",
      courseKind: "modulo",
      parentCohortId: "madre",
      position: 10,
      teacher: { name: "Diego Suárez" },
    });
    const m2 = cohorte("m2", {
      name: "Navisworks",
      courseName: "Navisworks",
      courseKind: "modulo",
      parentCohortId: "madre",
      position: 20,
    });
    const grupos = filtrarCohortes([madre, m1, m2], { ...sinFiltro, busqueda: "suarez" });
    expect(ids(grupos)).toEqual(["madre"]);
    expect(grupos[0]!.modules.map((m) => m.cohort.id)).toEqual(["m1", "m2"]);
    expect(ids(filtrarCohortes([madre, m1, m2], { ...sinFiltro, busqueda: "bim" }))).toEqual([
      "madre",
    ]);
    expect(filtrarCohortes([madre, m1, m2], { ...sinFiltro, busqueda: "civil" })).toEqual([]);
  });

  it("coincideCohorteConBusqueda mira grupo, curso y profesor", () => {
    expect(coincideCohorteConBusqueda(lista[0]!, "grupo silva")).toBe(true);
    expect(coincideCohorteConBusqueda(lista[0]!, "pereira")).toBe(false);
    // Un grupo sin nombre propio se encuentra por su curso.
    expect(coincideCohorteConBusqueda(cohorte("x", { name: null, courseName: "Civil 3D" }), "civil")).toBe(true);
  });

  it("los contadores reflejan la búsqueda", () => {
    const k = contadoresDeCohortes(lista, { ...sinFiltro, busqueda: "revit" }, 2026);
    expect(k.todas).toBe(2);
    expect(k.estados).toEqual({ planificada: 0, en_curso: 1, finalizada: 1 });
    expect(k.tipos).toEqual({ curso: 1, modulo: 0, taller: 1 });
    expect(k.todosLosAnios).toBe(2);
  });
});

describe("buscar cursos por nombre", () => {
  const cursos = [
    { id: "a", name: "Revit Arquitectura", kind: "curso" as const },
    { id: "b", name: "Revit MEP", kind: "modulo" as const },
    { id: "c", name: "Diseño paramétrico", kind: "taller" as const },
  ];

  it("filtra por nombre junto con el tipo", () => {
    expect(filtrarCursos(cursos, TODOS_TIPOS, "revit").map((c) => c.id)).toEqual(["a", "b"]);
    expect(filtrarCursos(cursos, new Set(["curso"]), "revit").map((c) => c.id)).toEqual(["a"]);
    expect(filtrarCursos(cursos, TODOS_TIPOS, "diseno").map((c) => c.id)).toEqual(["c"]);
    expect(filtrarCursos(cursos, TODOS_TIPOS, "mep revit").map((c) => c.id)).toEqual(["b"]);
  });

  it("los contadores por tipo reflejan la búsqueda", () => {
    expect(contarCursosPorTipo(cursos, "revit")).toEqual({ curso: 1, modulo: 1, taller: 0 });
    expect(contarCursosPorTipo(cursos)).toEqual({ curso: 1, modulo: 1, taller: 1 });
  });
});
