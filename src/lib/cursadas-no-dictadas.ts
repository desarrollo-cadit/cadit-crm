import { computeCohortStatus } from "@/lib/cohort-status";
import type { CourseKind } from "@/lib/course-kind";
import { grupoRecibeAvisoSinConfirmar } from "@/lib/avisos-sin-confirmar";

/**
 * 2026-10-22 — ¿Esta cursada es de un grupo que nunca salió?
 *
 * Grupos planificados que recibieron inscriptos y no salieron: como la
 * confirmación (039) no existía, nadie los confirmó, y al pasar sus fechas el
 * portal se los mostraba al ALUMNO como "Finalizado", como si los hubiera
 * cursado.
 *
 * Se decide sin dudas: sin confirmar, ya terminado por fecha, y SIN actividad
 * de la persona (asistencia, notas o certificado). Un curso viejo que sí se
 * dictó antes de 039 tiene asistencia y sigue apareciendo. Un grupo en curso
 * o por empezar no se toca: puede estar dictándose y lo decide quien confirma.
 *
 * Solo aplica a lo que se confirma (no talleres ni módulos, mismo criterio
 * que los avisos); los módulos siguen a su especialización.
 */
export function cursadaNuncaDictada(
  c: {
    confirmedAt: Date | null;
    startDate: Date;
    endDate: Date | null;
    courseKind: CourseKind | null;
    parentCohortId: string | null;
    tuvoActividad: boolean;
  },
  now: Date
): boolean {
  if (c.confirmedAt) return false;
  if (!grupoRecibeAvisoSinConfirmar(c)) return false;
  if (computeCohortStatus(c.startDate, c.endDate, now) !== "finalizada") return false;
  return !c.tuvoActividad;
}
