import { computeCohortStatus } from "@/lib/cohort-status";
import { cohortesInscribibles, etiquetaDeCohorte } from "@/lib/cohortes-inscribibles";
import type { CourseKind } from "@/lib/course-kind";
import { esCursado, type EstadoComercial } from "@/lib/recorrido-comercial";

/**
 * 046 (US2, US3; FR-005, FR-007) — Rutas entre cursos: qué se puede guardar
 * y qué se le sugiere a una persona. Puro: sin base ni reloj.
 *
 * Las rutas las cura la academia a mano ("después de Revit Arquitectura, Revit
 * MEP y Revit Estructura"): una regla explícita se audita, un cálculo no.
 */

/** Tope de cursos siguientes por curso: una ruta es una recomendación, no un catálogo. */
export const MAX_SIGUIENTES = 20;

export type ResultadoDeSiguientes =
  | { ok: true; ids: string[] }
  | { ok: false; code: "not_found" | "invalid_body"; message: string };

const TALLER = "Los talleres no forman parte de las rutas entre cursos.";

/**
 * La lista ordenada de siguientes de `fromCourseId`. `cursos` son los cursos
 * de la organización (lo ajeno no está y por eso no existe).
 *
 * Los ciclos (A → B → A) se permiten a propósito: cada sugerencia descarta lo
 * que la persona ya hizo, así que no hay bucle posible.
 */
export function validarSiguientes(
  fromCourseId: string,
  nextCourseIds: readonly string[],
  cursos: ReadonlyMap<string, { kind: CourseKind }>
): ResultadoDeSiguientes {
  const origen = cursos.get(fromCourseId);
  if (!origen) return { ok: false, code: "not_found", message: "Curso no encontrado" };
  if (origen.kind === "taller") return { ok: false, code: "invalid_body", message: TALLER };
  if (nextCourseIds.length > MAX_SIGUIENTES) {
    return {
      ok: false,
      code: "invalid_body",
      message: `Un curso puede tener hasta ${MAX_SIGUIENTES} cursos siguientes.`,
    };
  }
  if (nextCourseIds.includes(fromCourseId)) {
    return { ok: false, code: "invalid_body", message: "Un curso no puede seguirse a sí mismo." };
  }
  if (new Set(nextCourseIds).size !== nextCourseIds.length) {
    return { ok: false, code: "invalid_body", message: "Hay un curso repetido en la lista." };
  }
  for (const id of nextCourseIds) {
    const curso = cursos.get(id);
    if (!curso) return { ok: false, code: "invalid_body", message: "Alguno de los cursos elegidos no existe." };
    if (curso.kind === "taller") return { ok: false, code: "invalid_body", message: TALLER };
  }
  return { ok: true, ids: [...nextCourseIds] };
}

/* ============================================================
 * "Le podría interesar" (US3, FR-007)
 * ============================================================ */

export type GrupoAbierto = { cohortId: string; name: string; startDate: string };

export type SugerenciaDeRecompra = {
  courseId: string;
  courseName: string;
  /** Los cursos que la persona hizo y que llevan a este. */
  porCursos: string[];
  proximoGrupo: GrupoAbierto | null;
};

/**
 * Los siguientes de lo que la persona CURSÓ (aprobó, cursó sin aprobar o
 * está cursando), en el orden de la ruta, empezando por lo más reciente que
 * hizo. Sin repetidos, sin lo que ya hizo o en lo que ya está inscripta
 * (cualquier estado del historial), sin cursos que no se publican y sin
 * talleres. Un curso sin siguientes no sugiere nada.
 *
 * `historial` viene de `historialesComerciales` (ya ordenado, más reciente
 * primero): la definición de "cursó" no se repite acá.
 */
export function sugerenciasDeRecompra(
  historial: readonly { courseId: string; courseName: string; estado: EstadoComercial }[],
  rutas: ReadonlyMap<string, readonly string[]>,
  cursos: ReadonlyMap<string, { name: string; published: boolean; kind: CourseKind }>,
  proximos: ReadonlyMap<string, GrupoAbierto | null>
): SugerenciaDeRecompra[] {
  const yaHechos = new Set(historial.map((e) => e.courseId));
  const sugeridas = new Map<string, SugerenciaDeRecompra>();

  for (const origen of historial) {
    if (!esCursado(origen.estado)) continue;
    for (const id of rutas.get(origen.courseId) ?? []) {
      if (yaHechos.has(id)) continue;
      const curso = cursos.get(id);
      if (!curso || !curso.published || curso.kind === "taller") continue;
      const previa = sugeridas.get(id);
      if (previa) {
        if (!previa.porCursos.includes(origen.courseName)) previa.porCursos.push(origen.courseName);
        continue;
      }
      sugeridas.set(id, {
        courseId: id,
        courseName: curso.name,
        porCursos: [origen.courseName],
        proximoGrupo: proximos.get(id) ?? null,
      });
    }
  }
  return [...sugeridas.values()];
}

/**
 * El próximo grupo abierto a inscripción de un curso: el primero que
 * todavía no empezó, sin módulos de especialización (el mismo criterio que
 * `cohortesInscribibles`). `null` = "sin grupo abierto por ahora".
 */
export function proximoGrupoAbierto(
  grupos: readonly {
    id: string;
    name: string | null;
    courseName: string;
    startDate: Date;
    endDate: Date | null;
    parentCohortId: string | null;
  }[],
  now: Date
): GrupoAbierto | null {
  const abiertos = cohortesInscribibles(
    grupos.map((g) => ({
      ...g,
      startDate: g.startDate.toISOString(),
      status: computeCohortStatus(g.startDate, g.endDate, now),
    }))
  ).filter((g) => g.status === "planificada");
  const primero = abiertos[0];
  return primero
    ? { cohortId: primero.id, name: etiquetaDeCohorte(primero), startDate: primero.startDate.slice(0, 10) }
    : null;
}
