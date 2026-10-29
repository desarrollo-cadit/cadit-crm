/**
 * Cancelar (borrar) una inscripción hecha por error. Pura y sin base.
 *
 * `enrollment` arrastra en CASCADE cuotas, pagos, asistencia, notas,
 * entregas, correcciones, certificados e intentos de cuestionario. Un DELETE
 * sobre una inscripción con historia se lleva la prueba de lo que pasó, sin
 * aviso y sin vuelta. Por eso se borra SOLO lo que no tiene nada: el error de
 * carga del mismo día. Con cualquier rastro, no se borra. **Ante la duda no se
 * destruye.**
 *
 * La asistencia NO bloquea (2026-10-29): una inscripción duplicada a la que
 * se le pasó lista impedía unificar contactos. Se borra con la inscripción y
 * la vista previa dice cuántas clases se van.
 *
 * Qué es historia (bloquea) y qué es derivado (se va con la inscripción) está
 * clasificado tabla por tabla en `src/server/enrollment-cancel.ts`. El
 * servidor cuenta la historia de la madre MÁS la de sus módulos hijos y llama
 * a esta función dos veces: para la vista previa y, de nuevo, dentro de la
 * transacción con las filas bloqueadas.
 */

/** Lo que bloquea el borrado. Sumado sobre la inscripción y sus hijas. */
export type HistorialDeInscripcion = {
  /** Pagos registrados, anulados incluidos: un anulado también es un movimiento. */
  pagos: number;
  /** Certificados, anulados incluidos: un anulado también es un documento. */
  certificados: number;
  /** Resultados de evaluación (`assessment_result`). */
  resultados: number;
  /** Correcciones en cualquier estado: borrador, enviada o publicada. */
  correcciones: number;
  /** Entregas del alumno. */
  entregas: number;
  /** Intentos de cuestionario de cursos offline hechos por esta inscripción. */
  intentosOffline: number;
};

export const HISTORIAL_VACIO: HistorialDeInscripcion = {
  pagos: 0,
  certificados: 0,
  resultados: 0,
  correcciones: 0,
  entregas: 0,
  intentosOffline: 0,
};

export type InscripcionACancelar = {
  contacto: string;
  grupo: string;
  /** `cohort_id` presente. El lead general no es una inscripción a un grupo. */
  tieneGrupo: boolean;
  /** Cursada de un módulo (`parent_enrollment_id` presente). */
  esHija: boolean;
  /** Tiene `workshop_registration`: es un taller. */
  esTaller: boolean;
  /** Inscripciones hijas (módulos) que se irían con la madre. */
  modulos: number;
  /** Cuotas (sin pagos) que se borrarían. */
  cuotas: number;
  /** Programas con licencia ASIGNADA que vuelven al stock. */
  licencias: string[];
  /** Marcas de asistencia (cualquier estado) que se borran con ella: avisa, no bloquea. */
  asistencias: number;
  historial: HistorialDeInscripcion;
};

export type DetalleDeCancelacion = HistorialDeInscripcion & {
  contacto: string;
  grupo: string;
  modulos: number;
  cuotas: number;
  licencias: string[];
  asistencias: number;
};

export type CodigoDeBloqueo =
  | "inscripcion_con_historial"
  | "no_es_de_un_grupo"
  | "es_un_modulo"
  | "es_un_taller";

export type DecisionDeCancelacion =
  | { deletable: true; motivo: string; detalle: DetalleDeCancelacion }
  | { deletable: false; code: CodigoDeBloqueo; motivo: string; detalle: DetalleDeCancelacion };

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** "a", "a y b", "a, b y c". */
export function enumerar(partes: readonly string[]): string {
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

function partesDeHistorial(h: HistorialDeInscripcion): string[] {
  const partes: string[] = [];
  if (h.pagos > 0) partes.push(plural(h.pagos, "pago registrado", "pagos registrados"));
  if (h.certificados > 0) {
    partes.push(plural(h.certificados, "certificado emitido", "certificados emitidos"));
  }
  if (h.resultados > 0) partes.push(plural(h.resultados, "nota cargada", "notas cargadas"));
  if (h.correcciones > 0) partes.push(plural(h.correcciones, "corrección", "correcciones"));
  if (h.entregas > 0) partes.push(plural(h.entregas, "entrega", "entregas"));
  if (h.intentosOffline > 0) {
    partes.push(plural(h.intentosOffline, "intento de cuestionario", "intentos de cuestionario"));
  }
  return partes;
}

export function decidirCancelacion(i: InscripcionACancelar): DecisionDeCancelacion {
  const detalle: DetalleDeCancelacion = {
    ...i.historial,
    contacto: i.contacto,
    grupo: i.grupo,
    modulos: i.modulos,
    cuotas: i.cuotas,
    licencias: [...i.licencias],
    asistencias: i.asistencias,
  };

  if (!i.tieneGrupo) {
    return {
      deletable: false,
      code: "no_es_de_un_grupo",
      motivo:
        "No es una inscripción a un grupo: es la tarjeta de seguimiento del contacto. " +
        "Para sacar a la persona, dala de baja desde Contactos.",
      detalle,
    };
  }
  if (i.esHija) {
    return {
      deletable: false,
      code: "es_un_modulo",
      motivo:
        "Es la cursada de un módulo de una especialización: se saca desde la pestaña Alumnos " +
        "del módulo, o se cancela la inscripción a la especialización completa.",
      detalle,
    };
  }
  if (i.esTaller) {
    return {
      deletable: false,
      code: "es_un_taller",
      motivo: "Es una inscripción a un taller: se gestiona desde Talleres.",
      detalle,
    };
  }

  const partes = partesDeHistorial(i.historial);
  if (partes.length > 0) {
    const deModulos = i.modulos > 0 ? " (contando sus módulos)" : "";
    const salida =
      i.modulos > 0
        ? " Si lo que pasa es que un módulo lo va a cursar con otro grupo, se puede mudar desde el Recorrido de la especialización."
        : "";
    return {
      deletable: false,
      code: "inscripcion_con_historial",
      motivo:
        `Tiene ${enumerar(partes)}${deModulos}. ` +
        "Una inscripción con historial no se borra: esa historia es de la persona." +
        salida,
      detalle,
    };
  }

  const arrastra: string[] = [];
  if (i.cuotas > 0) arrastra.push(i.cuotas === 1 ? "su cuota" : `sus ${i.cuotas} cuotas`);
  if (i.licencias.length > 0) {
    arrastra.push(
      `${i.licencias.length === 1 ? "la licencia" : "las licencias"} de ${enumerar(i.licencias)}`
    );
  }
  if (i.asistencias > 0) {
    arrastra.push(`la asistencia de ${plural(i.asistencias, "clase", "clases")}`);
  }
  if (i.modulos > 0) {
    arrastra.push(`su inscripción a ${plural(i.modulos, "módulo", "módulos")}`);
  }
  const con = arrastra.length > 0 ? `, con ${enumerar(arrastra)}` : "";
  return {
    deletable: true,
    motivo:
      `Se va a borrar la inscripción de ${i.contacto} al grupo ${i.grupo}${con}. ` +
      "No se puede deshacer.",
    detalle,
  };
}
