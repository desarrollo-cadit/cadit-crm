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
  /**
   * Feriado que SE REPITE todos los años (2026-11-04): un solo día —`fromDate`
   * = `toDate`— cuyo mes y día valen cada año, desde el año de esa fecha en
   * adelante. `false` = rango (o día) de esa fecha nada más.
   */
  recurring: boolean;
};

/** Lo mínimo que `fechaEnReceso` necesita de un receso. */
export type RangoDeReceso = Pick<Receso, "fromDate" | "toDate"> & { recurring?: boolean };

/** El día de una clase como "YYYY-MM-DD" (su medianoche UTC). */
export function diaDeClase(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

/**
 * ¿Este día es el feriado anual de `referencia`? Mismo mes y día, desde el año
 * de la referencia en adelante (no se aplica hacia atrás). Un 29/02 cae el
 * 28/02 en los años que no son bisiestos: el feriado no desaparece tres de
 * cada cuatro años.
 */
function coincideConFeriadoAnual(dia: string, referencia: string): boolean {
  const anio = Number(dia.slice(0, 4));
  if (anio < Number(referencia.slice(0, 4))) return false;
  const mesDia = dia.slice(5);
  const feriado = referencia.slice(5);
  if (mesDia === feriado) return true;
  return feriado === "02-29" && mesDia === "02-28" && !esBisiesto(anio);
}

/** ¿Este receso alcanza al día "YYYY-MM-DD"? La ÚNICA definición. */
export function recesoCubreDia(r: RangoDeReceso, dia: string): boolean {
  if (r.recurring) return coincideConFeriadoAnual(dia, r.fromDate);
  // "YYYY-MM-DD" ordena lexicográficamente igual que cronológicamente.
  return r.fromDate <= dia && dia <= r.toDate;
}

/**
 * ¿Este día cae en algún receso? Devuelve el receso (para poder nombrarlo) o
 * `null`. Los rangos superpuestos se suman: alcanza con caer en uno. Los
 * feriados anuales (`recurring`) cuentan igual, año tras año.
 */
export function fechaEnReceso<R extends RangoDeReceso>(date: Date, recesos: readonly R[]): R | null {
  const dia = diaDeClase(date);
  return recesos.find((r) => recesoCubreDia(r, dia)) ?? null;
}

/**
 * Los recesos que tocan el rango [desde, hasta] ("YYYY-MM-DD", inclusive), en
 * concreto: cada feriado anual se vuelve el día de cada año que cae adentro
 * (`fromDate` = `toDate`), así el calendario no sabe que existen los anuales.
 */
export function recesosDelRango<R extends RangoDeReceso>(
  recesos: readonly R[],
  desde: string,
  hasta: string
): R[] {
  const out: R[] = [];
  for (const r of recesos) {
    if (!r.recurring) {
      if (r.fromDate <= hasta && r.toDate >= desde) out.push(r);
      continue;
    }
    for (let anio = Number(desde.slice(0, 4)); anio <= Number(hasta.slice(0, 4)); anio++) {
      const mesDia = r.fromDate.slice(5);
      const dia = `${anio}-${mesDia === "02-29" && !esBisiesto(anio) ? "02-28" : mesDia}`;
      if (dia >= desde && dia <= hasta && recesoCubreDia(r, dia)) {
        out.push({ ...r, fromDate: dia, toDate: dia });
      }
    }
  }
  return out.sort((a, b) => (a.fromDate < b.fromDate ? -1 : a.fromDate > b.fromDate ? 1 : 0));
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
  recurring?: boolean;
}): string | null {
  if (!input.name.trim()) return "El receso necesita un nombre (por ejemplo, \"Receso de verano\").";
  if (!fechaValida(input.fromDate) || !fechaValida(input.toDate)) {
    return "Las fechas del receso no son válidas.";
  }
  if (input.toDate < input.fromDate) {
    return "La fecha hasta no puede ser anterior a la fecha desde.";
  }
  if (input.recurring && input.fromDate !== input.toDate) {
    return "Un feriado que se repite todos los años es un solo día.";
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
  recesos: readonly (RangoDeReceso & Pick<Receso, "name">)[],
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
