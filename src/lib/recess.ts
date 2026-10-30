/**
 * 034 (US2/US3, FR-006..FR-015) — Recesos, borrado y reprogramación de clases.
 *
 * Todo lo que DECIDE vive acá, puro y sin base: qué día cae en un receso, qué
 * clase se puede borrar sin perder historia y cuándo se puede reprogramar una
 * cancelada. Las rutas averiguan los hechos y ejecutan; la pantalla usa las
 * mismas funciones para avisar antes de que el servidor rechace.
 *
 * ============================================================
 * Un receso es un rango de DÍAS, no de instantes
 * ============================================================
 * Se guarda como `date` ("2026-12-15") y se compara contra el día UTC de la
 * clase, que es como el cronograma guarda cada clase (la medianoche UTC del
 * día, ver `buildClassSchedule`). No se compone ningún instante: eso sigue
 * siendo exclusivo de `classInstant()` en `schedule-time.ts`.
 *
 * Los recesos no corren la fecha de fin de ninguna cohorte (FR-009): la fecha
 * de fin ya se elige contemplando el receso. Por eso esta función sólo SACA
 * días; nunca agrega clases para compensar.
 */

export type Receso = {
  id: string;
  name: string;
  /** "YYYY-MM-DD", inclusive. */
  fromDate: string;
  /** "YYYY-MM-DD", inclusive. */
  toDate: string;
  /** `null` = de la academia (todas las cohortes). */
  cohortId: string | null;
};

/** El día de una clase como "YYYY-MM-DD" (su medianoche UTC). */
export function diaDeClase(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * ¿Este día cae en algún receso? Devuelve el receso (para poder nombrarlo) o
 * `null`. Los rangos superpuestos se suman: alcanza con caer en uno.
 */
export function fechaEnReceso<R extends Pick<Receso, "fromDate" | "toDate">>(
  date: Date,
  recesos: readonly R[]
): R | null {
  const dia = diaDeClase(date);
  // "YYYY-MM-DD" ordena lexicográficamente igual que cronológicamente.
  return recesos.find((r) => r.fromDate <= dia && dia <= r.toDate) ?? null;
}

/** Los recesos que alcanzan a una cohorte: los de la academia más los suyos. */
export function recesosDeCohorte<R extends Pick<Receso, "cohortId">>(
  recesos: readonly R[],
  cohortId: string
): R[] {
  return recesos.filter((r) => r.cohortId === null || r.cohortId === cohortId);
}

function fechaValida(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00.000Z`);
  // `new Date("2026-02-30")` no falla: corre al 2 de marzo. Se compara de vuelta.
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/** El receso que se quiere guardar tiene sentido. `null` = sí. */
export function validarReceso(input: {
  name: string;
  fromDate: string;
  toDate: string;
}): string | null {
  if (!input.name.trim()) return "El receso necesita un nombre (por ejemplo, \"Receso de verano\").";
  if (!fechaValida(input.fromDate) || !fechaValida(input.toDate)) {
    return "Las fechas del receso no son válidas.";
  }
  if (input.toDate < input.fromDate) {
    return "La fecha hasta no puede ser anterior a la fecha desde.";
  }
  return null;
}

/* ============================================================
 * FR-008 / FR-012 — Borrar clases sin perder historia
 * ============================================================ */

export type MotivoParaConservar = "asistencia" | "grabacion" | "asistencia_y_grabacion";

export type ClaseParaBorrar = {
  id: string;
  date: Date;
  tieneAsistencia: boolean;
  tieneGrabacion: boolean;
};

/**
 * Qué se borra y qué se conserva. Una clase con asistencia o con grabación
 * tiene HISTORIA: borrarla se llevaría en cascada las marcas de cada alumno, o
 * dejaría una grabación sin clase. Esas se conservan y se listan para que una
 * persona decida (cancelarla, por ejemplo). El resto se borra.
 */
export function decidirBorradoDeClases(clases: readonly ClaseParaBorrar[]): {
  borrar: string[];
  conservar: { id: string; date: Date; motivo: MotivoParaConservar }[];
} {
  const borrar: string[] = [];
  const conservar: { id: string; date: Date; motivo: MotivoParaConservar }[] = [];
  for (const c of clases) {
    if (!c.tieneAsistencia && !c.tieneGrabacion) {
      borrar.push(c.id);
      continue;
    }
    conservar.push({
      id: c.id,
      date: c.date,
      motivo:
        c.tieneAsistencia && c.tieneGrabacion
          ? "asistencia_y_grabacion"
          : c.tieneAsistencia
            ? "asistencia"
            : "grabacion",
    });
  }
  return { borrar, conservar };
}

export const MOTIVO_PARA_CONSERVAR: Record<MotivoParaConservar, string> = {
  asistencia: "Tiene asistencia cargada.",
  grabacion: "Tiene grabación.",
  asistencia_y_grabacion: "Tiene asistencia y grabación.",
};

/* ============================================================
 * FR-013 / FR-014 — Reprogramar una clase cancelada
 * ============================================================ */

export type ErrorDeReprogramacion =
  | { code: "no_cancelada"; message: string }
  | { code: "ya_reprogramada"; message: string }
  | { code: "en_receso"; message: string; receso: string };

/**
 * ¿Se puede reprogramar? `null` = sí.
 *
 * - Sólo una clase CANCELADA: una clase viva se mueve cambiándole la fecha, no
 *   reprogramándola (y eso no es parte de esta fase).
 * - Una clase ya reprogramada no se vuelve a reprogramar: se reprograma la
 *   nueva. Si no, una cancelada tendría dos "reprogramada al …".
 * - Dentro de un receso se puede, pero sólo con confirmación explícita: el
 *   receso dice que ese día no hay clase, y quien reprograma tiene que decir
 *   que sabe lo que hace.
 */
export function validarReprogramacion(
  original: { canceled: boolean; yaReprogramada: boolean },
  nuevaFecha: Date,
  recesos: readonly Pick<Receso, "fromDate" | "toDate" | "name">[],
  confirmaReceso: boolean
): ErrorDeReprogramacion | null {
  if (!original.canceled) {
    return {
      code: "no_cancelada",
      message: "Sólo se puede reprogramar una clase suspendida. Suspendela primero.",
    };
  }
  if (original.yaReprogramada) {
    return {
      code: "ya_reprogramada",
      message: "Esta clase ya fue reprogramada: si hay que moverla de nuevo, suspendé y reprogramá la clase nueva.",
    };
  }
  const receso = fechaEnReceso(nuevaFecha, recesos);
  if (receso && !confirmaReceso) {
    return {
      code: "en_receso",
      receso: receso.name,
      message: `La fecha elegida cae en "${receso.name}". Confirmá que querés dar clase igual ese día.`,
    };
  }
  return null;
}
