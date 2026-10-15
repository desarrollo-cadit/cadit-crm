import { describe, expect, it } from "vitest";
import {
  TODOS_LOS_ANIOS,
  alternarTipo,
  aniosDisponibles,
  coincideAnio,
  contadoresDeCohortes,
  contarCursosPorTipo,
  filtrarCohortes,
  filtrarCursos,
  leerFiltroDeAnio,
  sinFechas,
} from "@/lib/academic-filters";
import type { CourseKind } from "@/lib/course-kind";

/**
 * 032 (US2/US3, FR-009..FR-014) — Los filtros de Académico, sin pantalla.
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
    status: "finalizada",
    ...p,
  };
}

const TODOS_ESTADOS = new Set<Estado>(["planificada", "en_curso", "finalizada"]);
const TODOS_TIPOS = new Set<CourseKind>(["curso", "modulo", "taller"]);
const sinFiltro = { estados: TODOS_ESTADOS, anio: TODOS_LOS_ANIOS, tipos: TODOS_TIPOS };
const ids = (g: { cohort: { id: string } }[]) => g.map((x) => x.cohort.id).sort();

describe("032 (FR-011) — el año de una cohorte", () => {
  it("de marzo a junio de 2025 no aparece en 2026", () => {
    const c = cohorte("x", { startDate: "2025-03-01T00:00:00.000Z", endDate: "2025-06-30T00:00:00.000Z" });
    expect(coincideAnio(c, 2026)).toBe(false);
    expect(coincideAnio(c, 2025)).toBe(true);
  });

  it("de noviembre a marzo aparece en los DOS años", () => {
    const c = cohorte("x", { startDate: "2025-11-03T00:00:00.000Z", endDate: "2026-03-20T00:00:00.000Z" });
    expect(coincideAnio(c, 2025)).toBe(true);
    expect(coincideAnio(c, 2026)).toBe(true);
    expect(coincideAnio(c, 2027)).toBe(false);
  });

  it("sin fin cargado, cuenta el año de inicio", () => {
    const c = cohorte("x", { startDate: "2026-08-01T00:00:00.000Z", endDate: null });
    expect(coincideAnio(c, 2026)).toBe(true);
    expect(coincideAnio(c, 2027)).toBe(false);
  });

  it("el año se lee como se cargó la fecha (UTC), no corrido por la zona", () => {
    // 1 de enero 00:00 UTC es 31 de diciembre en Montevideo: igual es 2026.
    const c = cohorte("x", { startDate: "2026-01-01T00:00:00.000Z", endDate: null });
    expect(coincideAnio(c, 2026)).toBe(true);
  });

  it("(FR-012) una cohorte sin fechas aparece con cualquier año", () => {
    const c = { startDate: null, endDate: null };
    expect(sinFechas(c)).toBe(true);
    expect(coincideAnio(c, 2026)).toBe(true);
    expect(coincideAnio(c, 1999)).toBe(true);
  });

  it("'Todos los años' no filtra", () => {
    const c = cohorte("x", { startDate: "2019-01-10T00:00:00.000Z", endDate: null });
    expect(coincideAnio(c, TODOS_LOS_ANIOS)).toBe(true);
  });
});

describe("032 (FR-011) — la preferencia guardada", () => {
  it("la primera vez es 'Todos los años'", () => {
    expect(leerFiltroDeAnio(null)).toBe(TODOS_LOS_ANIOS);
  });

  it("recupera un año guardado", () => {
    expect(leerFiltroDeAnio("2026")).toBe(2026);
    expect(leerFiltroDeAnio(TODOS_LOS_ANIOS)).toBe(TODOS_LOS_ANIOS);
  });

  it("un valor roto vuelve al default en vez de esconder todo", () => {
    expect(leerFiltroDeAnio("basura")).toBe(TODOS_LOS_ANIOS);
    expect(leerFiltroDeAnio("12")).toBe(TODOS_LOS_ANIOS);
  });
});

describe("032 (FR-009/FR-010) — el filtro de tipo de la pestaña Cursos", () => {
  const cursos = [
    { id: "a", kind: "curso" as const },
    { id: "b", kind: "modulo" as const },
    { id: "c", kind: "taller" as const },
    { id: "d", kind: "curso" as const },
  ];

  it("filtra por los tipos elegidos", () => {
    expect(filtrarCursos(cursos, new Set(["taller"])).map((c) => c.id)).toEqual(["c"]);
    expect(filtrarCursos(cursos, new Set(["curso", "modulo"])).map((c) => c.id)).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  it("cuenta por tipo", () => {
    expect(contarCursosPorTipo(cursos)).toEqual({ curso: 2, modulo: 1, taller: 1 });
  });

  it("alternar suma y saca, pero nunca deja el filtro vacío", () => {
    const solo = new Set<CourseKind>(["curso"]);
    expect([...alternarTipo(solo, "taller")].sort()).toEqual(["curso", "taller"]);
    expect([...alternarTipo(new Set(["curso", "taller"]), "curso")]).toEqual(["taller"]);
    expect([...alternarTipo(solo, "curso")]).toEqual(["curso"]);
  });
});

describe("032 (FR-013) — cohortes: año, tipo y estado combinados", () => {
  const lista = [
    cohorte("c2025", { startDate: "2025-03-01T00:00:00.000Z", endDate: "2025-06-30T00:00:00.000Z" }),
    cohorte("c2026", { status: "en_curso" }),
    cohorte("cruza", { startDate: "2025-11-01T00:00:00.000Z", endDate: "2026-03-01T00:00:00.000Z" }),
    cohorte("taller26", { courseKind: "taller", status: "planificada" }),
  ];

  it("solo este año: las de 2026 y la que cruza, ninguna que terminó en 2025", () => {
    expect(ids(filtrarCohortes(lista, { ...sinFiltro, anio: 2026 }))).toEqual([
      "c2026",
      "cruza",
      "taller26",
    ]);
  });

  it("los talleres de este año", () => {
    expect(
      ids(filtrarCohortes(lista, { ...sinFiltro, anio: 2026, tipos: new Set(["taller"]) }))
    ).toEqual(["taller26"]);
  });

  it("los tres filtros a la vez", () => {
    expect(
      ids(
        filtrarCohortes(lista, {
          estados: new Set(["finalizada"]),
          anio: 2026,
          tipos: new Set(["curso"]),
        })
      )
    ).toEqual(["cruza"]);
  });

  it("la especialización se evalúa por la madre y sus módulos van adentro", () => {
    const madre = cohorte("madre", {
      isSpecialization: true,
      startDate: "2026-02-01T00:00:00.000Z",
      endDate: "2026-12-01T00:00:00.000Z",
    });
    const modulo = cohorte("m1", {
      parentCohortId: "madre",
      courseKind: "modulo",
      position: 10,
      startDate: "2027-01-10T00:00:00.000Z",
      endDate: "2027-03-01T00:00:00.000Z",
    });
    const grupos = filtrarCohortes([madre, modulo], { ...sinFiltro, anio: 2026 });
    expect(ids(grupos)).toEqual(["madre"]);
    expect(grupos[0]!.modules.map((m) => m.cohort.id)).toEqual(["m1"]);

    // El año de un módulo no saca a la madre del año que no le toca.
    expect(filtrarCohortes([madre, modulo], { ...sinFiltro, anio: 2027 })).toEqual([]);

    // Filtrar por "Módulo" muestra la especialización que los contiene.
    expect(ids(filtrarCohortes([madre, modulo], { ...sinFiltro, tipos: new Set(["modulo"]) }))).toEqual([
      "madre",
    ]);
  });

  it("(FR-014) los contadores reflejan los demás filtros", () => {
    const filtros = { ...sinFiltro, anio: 2026, tipos: new Set<CourseKind>(["curso"]) };
    const k = contadoresDeCohortes(lista, filtros);
    // Estado: con año 2026 y tipo curso → c2026 (en curso) y cruza (finalizada).
    expect(k.todas).toBe(2);
    expect(k.estados).toEqual({ planificada: 0, en_curso: 1, finalizada: 1 });
    // Tipo: con año 2026 y todos los estados.
    expect(k.tipos).toEqual({ curso: 2, modulo: 0, taller: 1 });
    // Año: con tipo curso y todos los estados.
    expect(k.todosLosAnios).toBe(3);
    expect(k.anios.find((a) => a.anio === 2025)?.count).toBe(2);
    expect(k.anios.find((a) => a.anio === 2026)?.count).toBe(2);
  });
});

describe("032 — los años que ofrece el selector", () => {
  it("los de las cohortes más el actual, del más nuevo al más viejo", () => {
    const lista = [
      cohorte("a", { startDate: "2024-03-01T00:00:00.000Z", endDate: "2025-01-10T00:00:00.000Z" }),
      cohorte("b", { startDate: "2023-03-01T00:00:00.000Z", endDate: null }),
    ];
    expect(aniosDisponibles(lista, 2026)).toEqual([2026, 2025, 2024, 2023]);
  });
});
