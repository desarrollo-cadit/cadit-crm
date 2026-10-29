/**
 * FR-005c (016) — La fecha vigente de un alumno: la **más tardía** entre la del
 * grupo y su prórroga.
 *
 * Dicho al revés, que es como se entiende por qué: **una prórroga sólo puede
 * SUMAR plazo.** Tomando siempre la individual, correr después la fecha del
 * grupo más allá de ella dejaría al alumno con prórroga POR DETRÁS de sus
 * compañeros — castigado por una excepción que se le dio para ayudarlo.
 *
 * Las dos en `null` es un estado legítimo (DV-001): no todas las evaluaciones
 * tienen plazo, y sin plazo no hay "tardía" que marcar.
 *
 * 0084 — Vive en `src/lib` (era de `src/server/submissions.ts`, que la
 * re-exporta) para que el recordatorio por correo la use sin arrastrar la base.
 */
export function fechaVigente(grupo: Date | null, individual: Date | null): Date | null {
  if (!grupo) return individual;
  if (!individual) return grupo;
  return individual.getTime() > grupo.getTime() ? individual : grupo;
}
