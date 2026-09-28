import { etiquetaDeModulo, modulosConOrdinal } from "@/lib/program-order";

/**
 * 029 — El encabezado de `/cohorts/[id]`: qué cohorte es, de cuándo a cuándo,
 * de qué especialización cuelga y cómo se llega al módulo de al lado.
 *
 * PURA y en `lib/`: la regla del rótulo es la de `program-order.ts` —el
 * ordinal sale del LUGAR en la lista ordenada, nunca de `position`— y tiene
 * que decir "Módulo 2" del mismo módulo que la grilla y el listado.
 */

export type CohorteDelEncabezado = {
  id: string;
  name: string | null;
  courseName: string;
  startDate: Date;
  endDate: Date | null;
  isSpecialization: boolean;
  parentCohortId: string | null;
  position: number | null;
};

export type MadreDelEncabezado = { id: string; name: string | null; courseName: string };

export type HermanoDelEncabezado = {
  id: string;
  name: string | null;
  courseName: string;
  position: number | null;
  startDate: Date | null;
};

export type Miga = { label: string; href: string | null };

export type EncabezadoDeCohorte = {
  title: string;
  crumbs: Miga[];
  /** "Especialización", "Módulo 2 de 3", "Módulo" (sin orden) o nada. */
  badge: string | null;
  startDate: string;
  endDate: string | null;
  prev: { href: string; label: string } | null;
  next: { href: string; label: string } | null;
};

const ACADEMICO: Miga = { label: "Académico", href: "/academico" };

export function armarEncabezadoDeCohorte(
  cohorte: CohorteDelEncabezado,
  madre: MadreDelEncabezado | null,
  hermanos: readonly HermanoDelEncabezado[]
): EncabezadoDeCohorte {
  const nombre = cohorte.name ?? cohorte.courseName;
  const base = {
    startDate: cohorte.startDate.toISOString(),
    endDate: cohorte.endDate?.toISOString() ?? null,
  };

  /**
   * Sin la madre a la vista —no existe, o no se pudo leer— la miga NO la
   * inventa: se muestra la cohorte colgando de Académico, que es lo cierto
   * que se sabe.
   */
  if (!cohorte.parentCohortId || !madre) {
    return {
      ...base,
      title: nombre,
      crumbs: [ACADEMICO, { label: nombre, href: null }],
      badge: cohorte.isSpecialization ? "Especialización" : null,
      prev: null,
      next: null,
    };
  }

  const ordenados = modulosConOrdinal(hermanos);
  const i = ordenados.findIndex((m) => m.id === cohorte.id);
  const propio = ordenados[i];
  const ordinal = propio?.ordinal ?? null;
  const title = etiquetaDeModulo(ordinal, nombre);
  const conOrden = ordenados.filter((m) => m.ordinal !== null).length;

  // El vecino se nombra corto —"Módulo 3"— y sin orden, por su nombre.
  const vecino = (m: (typeof ordenados)[number] | undefined) =>
    m
      ? {
          href: `/cohorts/${m.id}`,
          label: m.ordinal === null ? (m.name ?? m.courseName) : `Módulo ${m.ordinal}`,
        }
      : null;

  return {
    ...base,
    title,
    crumbs: [
      ACADEMICO,
      { label: madre.name ?? madre.courseName, href: `/cohorts/${madre.id}` },
      { label: title, href: null },
    ],
    badge: ordinal === null ? "Módulo" : `Módulo ${ordinal} de ${conOrden}`,
    // Un módulo sin orden no tiene "anterior" ni "siguiente" que afirmar.
    prev: ordinal === null || i <= 0 ? null : vecino(ordenados[i - 1]),
    next:
      ordinal === null || i < 0 || ordenados[i + 1]?.ordinal == null
        ? null
        : vecino(ordenados[i + 1]),
  };
}
