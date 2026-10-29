/**
 * 2026-10-29 — Los filtros de la pantalla Talleres, sin pantalla: búsqueda por
 * texto (la MISMA regla de contactos y Académico, `coincideConBusqueda`) y año
 * (el MISMO criterio de 032, `coincideAnio`). Puros, con tests.
 *
 * Qué textos se buscan lo decide quien llama (`textosDe`): son los que la fila
 * muestra, y el formato de cada uno vive en el componente. Así la búsqueda
 * nunca encuentra algo que no se ve, ni deja de encontrar algo que sí.
 */

import { coincideConBusqueda } from "@/lib/contact-search";
import {
  TODOS_LOS_ANIOS,
  aniosDisponibles,
  coincideAnio,
  type FiltroDeAnio,
} from "@/lib/academic-filters";

export type TallerFiltrable = {
  startDate: string;
  endDate: string | null;
  /** Ya empezó (o pasó): va a "Realizados". */
  started: boolean;
};

export type FiltrosDeTalleres = { busqueda: string; anio: FiltroDeAnio };

export type TextosDeTaller<T> = (fila: T) => readonly (string | null | undefined)[];

function coincideBusqueda<T>(fila: T, busqueda: string, textosDe: TextosDeTaller<T>): boolean {
  return coincideConBusqueda(busqueda, { texto: textosDe(fila) });
}

/** Las ediciones que pasan la búsqueda Y el año, en el orden recibido. */
export function filtrarTalleres<T extends TallerFiltrable>(
  filas: readonly T[],
  filtros: FiltrosDeTalleres,
  textosDe: TextosDeTaller<T>
): T[] {
  return filas.filter(
    (f) => coincideAnio(f, filtros.anio) && coincideBusqueda(f, filtros.busqueda, textosDe)
  );
}

/** Próximos (sin empezar) arriba, realizados abajo. */
export function seccionesDeTalleres<T extends TallerFiltrable>(
  filas: readonly T[]
): { proximos: T[]; realizados: T[] } {
  return {
    proximos: filas.filter((f) => !f.started),
    realizados: filas.filter((f) => f.started),
  };
}

/**
 * Las cantidades del desplegable de año: cada año cuenta con la búsqueda
 * aplicada y SIN el año elegido (como en Académico: el contador dice qué
 * pasaría al elegirlo). Los años ofrecidos son los de todas las ediciones más
 * el actual, para que un año no desaparezca mientras se escribe.
 */
export function contadoresDeTalleres<T extends TallerFiltrable>(
  filas: readonly T[],
  busqueda: string,
  textosDe: TextosDeTaller<T>,
  anioActual: number
): { todosLosAnios: number; anios: { anio: number; count: number }[] } {
  const buscadas = filas.filter((f) => coincideBusqueda(f, busqueda, textosDe));
  return {
    todosLosAnios: buscadas.length,
    anios: aniosDisponibles(filas, anioActual).map((anio) => ({
      anio,
      count: buscadas.filter((f) => coincideAnio(f, anio)).length,
    })),
  };
}

export { TODOS_LOS_ANIOS };
