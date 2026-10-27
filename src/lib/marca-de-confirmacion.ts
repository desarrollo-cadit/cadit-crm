import { computeCohortStatus } from "@/lib/cohort-status";
import type { CourseKind } from "@/lib/course-kind";
import { grupoRecibeAvisoSinConfirmar } from "@/lib/avisos-sin-confirmar";
import { diasHastaElInicio } from "@/lib/staff-notices";

/**
 * Lo que se DIBUJA de la confirmación al lado del estado del grupo.
 *
 * El estado sigue siendo derivado de las fechas (`computeCohortStatus`) y no
 * hay estado "cancelado": esto es una marca de presentación.
 *
 * - `confirmado`: el grupo sale.
 * - `sin_confirmar`: neutral; todavía hay tiempo (o no aplica).
 * - `sin_confirmar_vencido`: llegó (o pasó) el día de inicio en la zona de la
 *   academia y nadie lo confirmó. Se pinta en rojo, EN LUGAR de "En curso",
 *   con las salidas: confirmar, reprogramar o borrar.
 *
 * No se marca en rojo:
 * - un taller ni un módulo (mismo criterio que los avisos,
 *   `grupoRecibeAvisoSinConfirmar`: lo que se confirma es el programa);
 * - un grupo ya finalizado: terminó, no queda nada que decidir, y los grupos
 *   anteriores a la confirmación (039) se pintarían todos de rojo.
 */
export type MarcaDeConfirmacion = "confirmado" | "sin_confirmar" | "sin_confirmar_vencido";

export function marcaDeConfirmacion(
  g: {
    startDate: Date;
    endDate: Date | null;
    confirmedAt: Date | null;
    courseKind: CourseKind | null;
    parentCohortId: string | null;
  },
  now: Date,
  timeZone: string
): MarcaDeConfirmacion {
  if (g.confirmedAt) return "confirmado";
  if (!grupoRecibeAvisoSinConfirmar(g)) return "sin_confirmar";
  if (computeCohortStatus(g.startDate, g.endDate, now) === "finalizada") return "sin_confirmar";
  const faltan = diasHastaElInicio(g.startDate, now, timeZone);
  const empezo = faltan === null ? now >= g.startDate : faltan <= 0;
  return empezo ? "sin_confirmar_vencido" : "sin_confirmar";
}

/**
 * 2026-10-22 — ¿Confirmar avisa a Soporte por correo, por defecto?
 *
 * Solo si el grupo todavía no empezó. Confirmar uno que ya está en curso (o
 * terminó) y nunca se confirmó porque la confirmación no existía mandaría la
 * lista de licencias de algo que ya pasó. Quien confirma puede cambiarlo.
 */
export function avisarAlConfirmarPorDefecto(startDate: Date, now: Date): boolean {
  return now < startDate;
}

/**
 * 2026-10-27 — Decisión del dueño: "si la especialización está confirmada, el
 * módulo también". No se escribe nada en el módulo (duplicaría los avisos de
 * facturación): se MUESTRA la confirmación efectiva. La propia manda; si no
 * tiene, la de la madre, diciendo de dónde viene (`deLaEspecializacion`).
 * Quitarle la confirmación a la madre la quita de los módulos sola.
 */
export function confirmacionParaMostrar<U>(
  propia: { confirmedAt: Date | null; confirmedBy: U | null },
  madre: { id: string; name: string; confirmedAt: Date | null; confirmedBy: U | null } | null
): { confirmedAt: Date | null; confirmedBy: U | null; deLaEspecializacion: { id: string; name: string } | null } {
  if (propia.confirmedAt || !madre?.confirmedAt) {
    return { confirmedAt: propia.confirmedAt, confirmedBy: propia.confirmedBy, deLaEspecializacion: null };
  }
  return {
    confirmedAt: madre.confirmedAt,
    confirmedBy: madre.confirmedBy,
    deLaEspecializacion: { id: madre.id, name: madre.name },
  };
}
