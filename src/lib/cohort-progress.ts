import {
  estadoDeClase,
  type ClaseParaAsistencia,
  type RelojDeAsistencia,
} from "@/lib/attendance-percentage";

/**
 * 2026-10-26 — "Clase X de Y" en el listado de grupos de Académico.
 *
 * - **X**: clases reales, no canceladas, que ya TERMINARON. Lo decide
 *   `estadoDeClase` (`dictada`), la misma regla del % de asistencia y de las
 *   horas dictadas: la clase de hoy cuenta recién cuando termina.
 * - **Y**: clases reales no canceladas.
 *
 * Sin cronograma generado no hay progreso (`null`): la pantalla muestra las
 * fechas en su lugar. Una proyección del calendario no es una clase.
 *
 * Puro: el servidor lo calcula en lote al armar el listado.
 */
export type ProgresoDeCursada = { dictadas: number; total: number };

export function progresoDeCursada(
  clases: readonly Pick<ClaseParaAsistencia, "sessionDate" | "endTime" | "canceled">[],
  reloj: RelojDeAsistencia
): ProgresoDeCursada | null {
  let dictadas = 0;
  let total = 0;
  for (const c of clases) {
    const estado = estadoDeClase(c, reloj);
    if (estado === "cancelada") continue;
    total += 1;
    if (estado === "dictada") dictadas += 1;
  }
  return total === 0 ? null : { dictadas, total };
}

/**
 * Una especialización no dicta clases propias: las dictan sus módulos. Su
 * progreso es la suma de los de ellos (los que no tienen cronograma no suman).
 */
export function sumarProgresos(
  progresos: readonly (ProgresoDeCursada | null | undefined)[]
): ProgresoDeCursada | null {
  let dictadas = 0;
  let total = 0;
  for (const p of progresos) {
    if (!p) continue;
    dictadas += p.dictadas;
    total += p.total;
  }
  return total === 0 ? null : { dictadas, total };
}

export function porcentajeDeProgreso(p: ProgresoDeCursada): number {
  if (p.total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((p.dictadas / p.total) * 100)));
}
