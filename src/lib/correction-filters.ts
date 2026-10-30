/**
 * 2026-10-30 — Los filtros de la bandeja de Correcciones, sin pantalla.
 *
 * La bandeja trae TODAS las pendientes de una vez (es lo que espera
 * aprobación: decenas, no miles) y filtra acá: búsqueda por alumno,
 * evaluación o grupo (la MISMA regla de contactos), y desplegables de grupo y
 * de evaluación con su cantidad. La evaluación se elige por NOMBRE: las
 * evaluaciones son por grupo (`assessment.cohort_id`), y "Entrega final" de
 * dos grupos es, para quien aprueba, la misma pregunta.
 */

import { coincideConBusqueda } from "@/lib/contact-search";

export type CorreccionFiltrable = {
  assessmentName: string;
  cohortId: string;
  cohortName: string;
  studentName: string;
};

export type FiltrosDeCorrecciones = {
  busqueda: string;
  /** "" = todos los grupos. */
  cohortId: string;
  /** Nombre de la evaluación; "" = todas. */
  evaluacion: string;
};

export const SIN_FILTROS_DE_CORRECCIONES: FiltrosDeCorrecciones = {
  busqueda: "",
  cohortId: "",
  evaluacion: "",
};

function pasa(i: CorreccionFiltrable, f: FiltrosDeCorrecciones): boolean {
  return (
    (!f.cohortId || i.cohortId === f.cohortId) &&
    (!f.evaluacion || i.assessmentName === f.evaluacion) &&
    coincideConBusqueda(f.busqueda, { texto: [i.studentName, i.assessmentName, i.cohortName] })
  );
}

/** Las que pasan los tres filtros, en el orden recibido. */
export function filtrarCorrecciones<T extends CorreccionFiltrable>(
  items: readonly T[],
  f: FiltrosDeCorrecciones
): T[] {
  return items.filter((i) => pasa(i, f));
}

export type OpcionConCantidad = { clave: string; etiqueta: string; cantidad: number };

/**
 * Las opciones de los dos desplegables, por nombre. Se ofrecen TODOS los
 * grupos y evaluaciones de la bandeja (filtrar no los borra) y cada cantidad
 * se cuenta con los demás filtros puestos y sin el suyo.
 */
export function opcionesDeCorrecciones<T extends CorreccionFiltrable>(
  items: readonly T[],
  f: FiltrosDeCorrecciones
): {
  grupos: OpcionConCantidad[];
  todosLosGrupos: number;
  evaluaciones: OpcionConCantidad[];
  todasLasEvaluaciones: number;
} {
  const sinGrupo = filtrarCorrecciones(items, { ...f, cohortId: "" });
  const sinEvaluacion = filtrarCorrecciones(items, { ...f, evaluacion: "" });

  const nombresDeGrupo = new Map<string, string>();
  const nombresDeEvaluacion = new Set<string>();
  for (const i of items) {
    nombresDeGrupo.set(i.cohortId, i.cohortName);
    nombresDeEvaluacion.add(i.assessmentName);
  }
  const porNombre = (a: OpcionConCantidad, b: OpcionConCantidad) => a.etiqueta.localeCompare(b.etiqueta, "es");

  return {
    grupos: [...nombresDeGrupo]
      .map(([clave, etiqueta]) => ({
        clave,
        etiqueta,
        cantidad: sinGrupo.filter((i) => i.cohortId === clave).length,
      }))
      .sort(porNombre),
    todosLosGrupos: sinGrupo.length,
    evaluaciones: [...nombresDeEvaluacion]
      .map((nombre) => ({
        clave: nombre,
        etiqueta: nombre,
        cantidad: sinEvaluacion.filter((i) => i.assessmentName === nombre).length,
      }))
      .sort(porNombre),
    todasLasEvaluaciones: sinEvaluacion.length,
  };
}
