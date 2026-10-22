import { diaCorto } from "@/lib/staff-notices";

/**
 * "Reprogramar" un grupo: fechas nuevas de inicio y fin, mismos días y
 * horario. Es una de las dos salidas de un grupo que llegó a su fecha sin
 * confirmarse (la otra es borrarlo).
 *
 * PURO: decide con los hechos ya leídos. La escritura vive en
 * `reprogramarCohorte()` (`src/server/cohort-reprogram.ts`), que valida TODO
 * con esta función antes de la primera escritura: devolver un error no revierte
 * la transacción del pedido, y un plan a medias dejaría el grupo sin clases.
 *
 * La "historia" de una clase es la misma que usa el borrado de clases por
 * receso (`decidirBorradoDeClases`, 034): asistencia o grabación. Una clase
 * con historia no se borra, y como reprogramar es borrar y volver a generar,
 * bloquea.
 */

export type ClaseParaReprogramar = { tieneAsistencia: boolean; tieneGrabacion: boolean };

export type DatosDeReprogramacion = {
  esEspecializacion: boolean;
  inicioActual: Date;
  nuevoInicio: Date;
  nuevoFin: Date | null;
  /** CSV de días del grupo (se conservan). */
  diasDeCursada: string | null;
  /** Las clases reales (`class_session`) del grupo hoy. */
  clases: readonly ClaseParaReprogramar[];
  /** Cuántas clases produce el cronograma con las fechas nuevas (`buildClassSchedule`). */
  clasesNuevas: number;
};

export type CodigoDeBloqueo =
  | "especializacion"
  | "fechas_invalidas"
  | "misma_fecha"
  | "clases_con_historia"
  | "sin_fecha_fin"
  | "sin_dias"
  | "sin_clases";

export type PlanDeReprogramacion =
  | {
      accion: "reprogramar";
      clasesABorrar: number;
      /** El grupo tenía cronograma: se vuelve a generar con las fechas nuevas. */
      regenera: boolean;
      clasesNuevas: number;
      mensaje: string;
    }
  | { accion: "bloquear"; code: CodigoDeBloqueo; motivo: string };

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export function planDeReprogramacion(d: DatosDeReprogramacion): PlanDeReprogramacion {
  const bloquear = (code: CodigoDeBloqueo, motivo: string): PlanDeReprogramacion => ({
    accion: "bloquear",
    code,
    motivo,
  });

  if (d.esEspecializacion) {
    return bloquear(
      "especializacion",
      "Es una especialización: sus fechas son las de sus módulos. Cambiá las de cada módulo con «Editar grupo»."
    );
  }
  if (d.nuevoFin && d.nuevoFin < d.nuevoInicio) {
    return bloquear("fechas_invalidas", "La fecha de fin no puede ser anterior a la de inicio.");
  }
  if (d.nuevoInicio.getTime() === d.inicioActual.getTime()) {
    return bloquear("misma_fecha", "Elegí una fecha de inicio distinta de la actual.");
  }

  const conHistoria = d.clases.filter((c) => c.tieneAsistencia || c.tieneGrabacion).length;
  if (conHistoria > 0) {
    return bloquear(
      "clases_con_historia",
      `Tiene ${plural(conHistoria, "clase", "clases")} con asistencia o grabación: el grupo ya se ` +
        "empezó a dictar y esas clases no se borran. Si solo cambian las fechas, usá «Editar grupo»."
    );
  }

  const regenera = d.clases.length > 0;
  if (!regenera) {
    return {
      accion: "reprogramar",
      clasesABorrar: 0,
      regenera: false,
      clasesNuevas: 0,
      mensaje: `El grupo no tiene clases generadas: solo cambian las fechas. Empieza el ${diaCorto(d.nuevoInicio)}.`,
    };
  }

  if (!d.nuevoFin) {
    return bloquear(
      "sin_fecha_fin",
      "El grupo tiene cronograma: para generarlo de nuevo hace falta la fecha de fin."
    );
  }
  if (!d.diasDeCursada) {
    return bloquear(
      "sin_dias",
      "El grupo no tiene días de cursada: no se puede generar el cronograma de nuevo. Cargalos con «Editar grupo»."
    );
  }
  if (d.clasesNuevas === 0) {
    return bloquear("sin_clases", "Con esas fechas y esos días de cursada no hay ninguna clase.");
  }

  const n = d.clases.length;
  return {
    accion: "reprogramar",
    clasesABorrar: n,
    regenera: true,
    clasesNuevas: d.clasesNuevas,
    mensaje:
      `Se ${n === 1 ? "borra" : "borran"} ${plural(n, "clase", "clases")} sin asistencia y se ` +
      `${n === 1 ? "genera" : "generan"} de nuevo desde el ${diaCorto(d.nuevoInicio)} ` +
      `(${plural(d.clasesNuevas, "clase", "clases")}).`,
  };
}
