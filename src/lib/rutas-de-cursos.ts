import type { CourseKind } from "@/lib/course-kind";

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
