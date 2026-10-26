/**
 * 032 (US2/US3, FR-009..FR-014) — Los filtros de Académico, sin pantalla.
 *
 * Puros y separados del componente por el mismo motivo que `nextStatusFilter`
 * (007): la lógica de un filtro no la ven ni el typecheck ni el build, y la
 * primera versión de aquel invertía la selección.
 */

import {
  agruparEspecializaciones,
  type CohorteAgrupable,
  type GrupoDelListado,
} from "@/lib/program-order";
import { COURSE_KINDS, type CourseKind } from "@/lib/course-kind";
import { coincideConBusqueda } from "@/lib/contact-search";

type Estado = CohorteAgrupable["status"];
const ESTADOS: readonly Estado[] = ["planificada", "en_curso", "finalizada"];

/** El valor de "Todos los años". Un string y no `null` para poder guardarlo tal cual. */
export const TODOS_LOS_ANIOS = "todos" as const;
export type FiltroDeAnio = typeof TODOS_LOS_ANIOS | number;

type ConFechas = { startDate: string | null; endDate: string | null };

/**
 * El año de una fecha tal como se cargó. Las fechas de cohorte entran como
 * `AAAA-MM-DD` y se guardan a medianoche UTC: leerlas en la zona del navegador
 * correría el 1 de enero al 31 de diciembre del año anterior.
 */
function anioDe(iso: string): number {
  return new Date(iso).getUTCFullYear();
}

/** 032 (FR-012) — Una cohorte a medio cargar: no tiene ninguna fecha. */
export function sinFechas(c: ConFechas): boolean {
  return !c.startDate && !c.endDate;
}

/**
 * 032 (FR-011) — Si una cohorte entra en el año elegido: su inicio O su fin
 * caen en él. La que va de noviembre a marzo aparece en los dos años.
 *
 * Una cohorte sin fechas aparece SIEMPRE (FR-012): esconderla haría que una
 * cohorte a medio cargar se pierda de vista justo cuando falta completarla.
 */
export function coincideAnio(c: ConFechas, anio: FiltroDeAnio): boolean {
  if (anio === TODOS_LOS_ANIOS || sinFechas(c)) return true;
  return (
    (c.startDate !== null && anioDe(c.startDate) === anio) ||
    (c.endDate !== null && anioDe(c.endDate) === anio)
  );
}

/**
 * 032 (FR-011) — La preferencia guardada en el navegador. Lo que no se pueda
 * leer vuelve a "Todos los años": un valor roto no puede esconder cohortes.
 */
export function leerFiltroDeAnio(raw: string | null): FiltroDeAnio {
  if (raw === null || raw === TODOS_LOS_ANIOS) return TODOS_LOS_ANIOS;
  if (!/^\d{4}$/.test(raw)) return TODOS_LOS_ANIOS;
  return Number(raw);
}

/** Los años que ofrece el selector: los de las cohortes más el actual, del más nuevo al más viejo. */
export function aniosDisponibles(cohorts: readonly ConFechas[], actual: number): number[] {
  const anios = new Set<number>([actual]);
  for (const c of cohorts) {
    if (c.startDate) anios.add(anioDe(c.startDate));
    if (c.endDate) anios.add(anioDe(c.endDate));
  }
  return [...anios].sort((a, b) => b - a);
}

/* ============================================================
 * Pestaña Cursos
 * ============================================================ */

/**
 * 032 (FR-009) — Tocar un tipo lo suma o lo saca. Nunca deja el filtro vacío:
 * una lista vacía porque no hay ningún tipo elegido parece un catálogo
 * borrado.
 */
export function alternarTipo(
  current: ReadonlySet<CourseKind>,
  clicked: CourseKind
): Set<CourseKind> {
  const next = new Set(current);
  if (next.has(clicked)) next.delete(clicked);
  else next.add(clicked);
  return next.size === 0 ? new Set(current) : next;
}

type CursoFiltrable = { kind: CourseKind; name?: string };

/**
 * 2026-10-26 — El buscador de Cursos: por nombre, con la regla de la búsqueda
 * de contactos (`coincideConBusqueda`: cada palabra, cualquier orden, sin
 * tildes ni mayúsculas). Una sola regla de "coincide" en todo el panel.
 */
function cursoCoincide(c: CursoFiltrable, busqueda: string | undefined): boolean {
  return !busqueda || coincideConBusqueda(busqueda, { texto: [c.name] });
}

export function filtrarCursos<T extends CursoFiltrable>(
  courses: readonly T[],
  tipos: ReadonlySet<CourseKind>,
  busqueda?: string
): T[] {
  return courses.filter((c) => tipos.has(c.kind) && cursoCoincide(c, busqueda));
}

/** Cuántos cursos de cada tipo, con la búsqueda aplicada (FR-014). */
export function contarCursosPorTipo(
  courses: readonly CursoFiltrable[],
  busqueda?: string
): Record<CourseKind, number> {
  const out = Object.fromEntries(COURSE_KINDS.map((k) => [k, 0])) as Record<CourseKind, number>;
  for (const c of courses) if (cursoCoincide(c, busqueda)) out[c.kind] += 1;
  return out;
}

/* ============================================================
 * Pestaña Cohortes
 * ============================================================ */

export type CohorteFiltrable = CohorteAgrupable & {
  endDate: string | null;
  courseKind: CourseKind;
  /** Para el buscador; una especialización no tiene profesor propio. */
  teacher?: { name: string } | null;
};

export type FiltrosDeCohortes = {
  estados: ReadonlySet<Estado>;
  anio: FiltroDeAnio;
  tipos: ReadonlySet<CourseKind>;
  /** 2026-10-26 — Texto del buscador; vacío o ausente no filtra. */
  busqueda?: string;
};

/**
 * 2026-10-26 — Un grupo coincide con el buscador por su nombre, el de su
 * curso o el de su profesor (`coincideConBusqueda`, la regla de contactos:
 * cada palabra en ALGÚN campo, en cualquier orden).
 */
export function coincideCohorteConBusqueda(
  c: Pick<CohorteFiltrable, "name" | "courseName" | "teacher">,
  busqueda: string | undefined
): boolean {
  if (!busqueda) return true;
  return coincideConBusqueda(busqueda, {
    texto: [c.name, c.courseName, c.teacher?.name],
  });
}

/**
 * 032 (FR-011/FR-013) — Estado, año y tipo, los tres a la vez.
 *
 * El estado lo sigue resolviendo `agruparEspecializaciones` (028), que ya
 * sabe que una madre se muestra si ella o un módulo coincide. Año y tipo se
 * aplican DESPUÉS, sobre cada fila del listado:
 *
 * - el **año** se evalúa sobre la cohorte madre: los módulos se ven adentro
 *   de ella como siempre, y el año de un módulo no mueve a la madre de año;
 * - el **tipo** acepta la fila si la madre o alguno de sus módulos es de un
 *   tipo elegido, igual que el estado: filtrar "Módulo" tiene que mostrar las
 *   especializaciones que los contienen.
 *
 * - la **búsqueda** (2026-10-26) acepta la fila si la madre o alguno de sus
 *   módulos coincide, igual que el tipo: buscar al profesor de un módulo
 *   tiene que traer la especialización. Los módulos se siguen mostrando
 *   TODOS: son la estructura del programa.
 *
 * Filtrar la lista ANTES de agrupar no sirve: un módulo cuya madre quedó
 * afuera se dibujaría suelto.
 */
export function filtrarCohortes<T extends CohorteFiltrable>(
  cohorts: readonly T[],
  filtros: FiltrosDeCohortes
): GrupoDelListado<T>[] {
  return agruparEspecializaciones(cohorts, filtros.estados).filter(
    (g) =>
      coincideAnio(g.cohort, filtros.anio) &&
      (filtros.tipos.has(g.cohort.courseKind) ||
        g.modules.some((m) => filtros.tipos.has(m.cohort.courseKind))) &&
      (coincideCohorteConBusqueda(g.cohort, filtros.busqueda) ||
        g.modules.some((m) => coincideCohorteConBusqueda(m.cohort, filtros.busqueda)))
  );
}

export type ContadoresDeCohortes = {
  /** Con año y tipo aplicados, todos los estados. */
  todas: number;
  estados: Record<Estado, number>;
  /** Con estado y año aplicados. */
  tipos: Record<CourseKind, number>;
  /** Con estado y tipo aplicados. */
  todosLosAnios: number;
  anios: { anio: number; count: number }[];
};

/**
 * 032 (FR-014) — Cuántas filas quedarían con cada opción, con los DEMÁS
 * filtros aplicados (la búsqueda incluida). Se cuentan filas del listado (una especialización con
 * sus módulos es una), que es lo que la persona ve.
 */
export function contadoresDeCohortes<T extends CohorteFiltrable>(
  cohorts: readonly T[],
  filtros: FiltrosDeCohortes,
  anioActual: number = new Date().getFullYear()
): ContadoresDeCohortes {
  const contar = (f: Partial<FiltrosDeCohortes>) =>
    filtrarCohortes(cohorts, { ...filtros, ...f }).length;

  const estados = Object.fromEntries(
    ESTADOS.map((s) => [s, contar({ estados: new Set([s]) })])
  ) as Record<Estado, number>;
  const tipos = Object.fromEntries(
    COURSE_KINDS.map((k) => [k, contar({ tipos: new Set([k]) })])
  ) as Record<CourseKind, number>;

  return {
    todas: contar({ estados: new Set(ESTADOS) }),
    estados,
    tipos,
    todosLosAnios: contar({ anio: TODOS_LOS_ANIOS }),
    anios: aniosDisponibles(cohorts, anioActual).map((anio) => ({
      anio,
      count: contar({ anio }),
    })),
  };
}
