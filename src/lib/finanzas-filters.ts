/**
 * 2026-10-30 — La búsqueda de la pantalla Finanzas, sin pantalla.
 *
 * La MISMA regla de contactos (`coincideConBusqueda`): cada palabra en
 * alumno, grupo o curso, sin tildes ni mayúsculas. **La búsqueda solo esconde
 * filas: los totales de cada bloque no cambian** (DV-001 de 026: un total que
 * cambia con lo que se escribe sería una trampa para quien transcribe).
 */

import { coincideConBusqueda } from "@/lib/contact-search";

export type FilaBuscableDeFinanzas = { alumno: string; cohorte: string; curso: string };

export function coincideFilaDeFinanzas(fila: FilaBuscableDeFinanzas, busqueda: string): boolean {
  return coincideConBusqueda(busqueda, { texto: [fila.alumno, fila.cohorte, fila.curso] });
}

/** Cuántas filas se ven y cuántas hay, sumando los bloques de todas las monedas. */
export function conteoDeFilas<T extends FilaBuscableDeFinanzas>(
  bloques: readonly { filas: readonly T[] }[],
  busqueda: string
): { mostrando: number; total: number } {
  let mostrando = 0;
  let total = 0;
  for (const b of bloques) {
    total += b.filas.length;
    mostrando += b.filas.filter((f) => coincideFilaDeFinanzas(f, busqueda)).length;
  }
  return { mostrando, total };
}
