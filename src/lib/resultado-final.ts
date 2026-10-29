import { z } from "zod";
import { programApprovalState, type ApprovalState, type ModuleState } from "@/lib/approval";
import type { EstadoDeGrupo } from "@/lib/resultado-de-cursada";
import { estadoDeClase, type RelojDeAsistencia } from "@/lib/attendance-percentage";
import { computeCohortStatus } from "@/lib/cohort-status";

/**
 * 0086 — El RESULTADO FINAL de una cursada, confirmado por una persona.
 *
 * Decisión del dueño (2026-10-23): **ninguna aprobación es automática**. La
 * aprobación automática dejó a alumnos sacar certificados que no debían. Desde
 * acá:
 *
 * - `approvalState` / `estadoDeModulo` (notas + asistencia) son una
 *   SUGERENCIA, que solo ven el staff y el profesor, y siempre rotulada así.
 * - Lo que se AFIRMA sobre una persona —certificado, escolaridad, legajo,
 *   portal, recorrido comercial, reportes, constancia— sale del resultado que
 *   CONFIRMÓ el profesor del grupo (o Coordinación con `correcciones.aprobar`)
 *   cuando el grupo terminó. Sin confirmar = pendiente, nunca aprobado.
 * - La especialización (madre) no se confirma: se compone, con la regla de
 *   siempre (`programApprovalState`), sobre los resultados CONFIRMADOS de sus
 *   módulos.
 *
 * - (Decisión del dueño, 2026-10-29) Solo entra al circuito un grupo
 *   COMPLETO (`grupoCompleto`): terminado y con la asistencia tomada en cada
 *   clase dictada. Uno terminado e INCOMPLETO —los importados de antes del
 *   sistema, que nunca se trabajaron— NO TIENE resultado: ni aprobado, ni
 *   reprobado, ni pendiente de confirmación. Sus certificados ya emitidos se
 *   tratan como anulados (al leer) y no se emiten nuevos.
 *
 * Puro: no lee la base ni el reloj.
 */

export type ResultadoFinal = "aprobado" | "reprobado";

/* ============================================================
 * El grupo COMPLETO (decisión del dueño, 2026-10-29)
 * ============================================================ */

/** Una clase, con lo que hace falta para decidir si el grupo está completo. */
export type ClaseDeGrupo = {
  /** `class_session.date`: medianoche UTC del día. */
  date: Date;
  endTime: string | null;
  canceledAt: Date | null;
  /** Alguien pasó lista (`asistenciaTomadaSql`, la misma noción del %). */
  tomada: boolean | null;
};

/**
 * ¿Está COMPLETO el grupo? Toda clase DICTADA (terminó en la zona de la
 * academia y no se canceló: `estadoDeClase`, la regla única del porcentaje)
 * tiene la asistencia tomada. Sin una sola clase dictada no hay nada que
 * respalde un resultado: incompleto.
 */
export function grupoCompleto(clases: readonly ClaseDeGrupo[], reloj: RelojDeAsistencia): boolean {
  const dictadas = clases.filter(
    (c) =>
      estadoDeClase({ sessionDate: c.date, endTime: c.endTime, canceled: c.canceledAt !== null }, reloj) ===
      "dictada"
  );
  return dictadas.length > 0 && dictadas.every((c) => Boolean(c.tomada));
}

/**
 * ¿El grupo TERMINÓ sin estar completo? Entonces no tiene resultado: ni se
 * confirma ni se afirma nada sobre sus alumnos. Un grupo en curso o por
 * comenzar todavía puede completarse: `false`.
 */
export function grupoSinResultado(
  grupo: { startDate: Date | null; endDate: Date | null },
  clases: readonly ClaseDeGrupo[],
  reloj: RelojDeAsistencia
): boolean {
  if (!grupo.startDate) return false;
  if (computeCohortStatus(grupo.startDate, grupo.endDate, reloj.now, reloj.timeZone) !== "finalizada") {
    return false;
  }
  return !grupoCompleto(clases, reloj);
}

/** Lo que se dice de una cursada de un grupo terminado e incompleto. */
export const RAZON_GRUPO_INCOMPLETO =
  "Sin resultado: el grupo terminó sin la asistencia completa";

/** Lo que se dice mientras nadie confirmó. */
export const RAZON_SIN_CONFIRMAR = "Resultado pendiente de confirmación";

export type CodigoDeNoConfirmable = "grupo_no_finalizado" | "grupo_incompleto" | "se_confirma_por_modulos";

/**
 * ¿Se puede confirmar el resultado de esta inscripción? Solo con el grupo
 * TERMINADO (`computeCohortStatus`, la misma regla de Académico) y nunca en la
 * madre de una especialización, que sale de sus módulos.
 */
export function puedeConfirmarResultado(input: {
  estadoDelGrupo: EstadoDeGrupo;
  /** `grupoCompleto`: toda clase dictada con la asistencia tomada. */
  grupoCompleto: boolean;
  tieneModulos: boolean;
}): { ok: true } | { ok: false; code: CodigoDeNoConfirmable; message: string } {
  if (input.estadoDelGrupo !== "finalizada") {
    return {
      ok: false,
      code: "grupo_no_finalizado",
      message: "El resultado final se confirma cuando el grupo terminó",
    };
  }
  if (!input.grupoCompleto) {
    return {
      ok: false,
      code: "grupo_incompleto",
      message:
        "Este grupo no tiene la asistencia completa: primero hay que pasar lista en todas las clases dictadas",
    };
  }
  if (input.tieneModulos) {
    return {
      ok: false,
      code: "se_confirma_por_modulos",
      message: "El resultado de una especialización sale de los resultados confirmados de sus módulos",
    };
  }
  return { ok: true };
}

/**
 * Lo que se AFIRMA de una cursada: el resultado confirmado, o `pendiente`.
 * La sugerencia no entra acá a propósito: no hay camino por el que un cálculo
 * se convierta en un hecho.
 */
export function estadoAfirmado(confirmado: ResultadoFinal | null): {
  state: ApprovalState;
  reasons: string[];
} {
  if (confirmado === null) return { state: "pendiente", reasons: [RAZON_SIN_CONFIRMAR] };
  return { state: confirmado, reasons: [] };
}

const PALABRA_DE_SUGERENCIA: Record<ModuleState, string> = {
  aprobado: "aprobado",
  reprobado: "reprobado",
  pendiente: "pendiente",
  sin_datos: "sin datos",
};

/**
 * Para las pantallas del STAFF que muestran una cursada o un módulo: el estado
 * afirmado (confirmado; si no, `pendiente`, o `sin_datos` cuando no hay nada
 * cargado) y, mientras no se confirme, la sugerencia dicha COMO sugerencia en
 * las razones. El cálculo nunca ocupa el lugar del hecho.
 */
export function afirmadoConSugerencia(
  confirmado: ResultadoFinal | null,
  sugerencia: { state: ModuleState; reasons: string[] },
  /** Grupo terminado e incompleto: no hay resultado, ni confirmado ni sugerido. */
  sinResultado = false
): { state: ModuleState; reasons: string[] } {
  if (sinResultado) return { state: "sin_datos", reasons: [RAZON_GRUPO_INCOMPLETO] };
  if (confirmado !== null) return { state: confirmado, reasons: [] };
  if (sugerencia.state === "sin_datos") return sugerencia;
  return {
    state: "pendiente",
    reasons: [
      RAZON_SIN_CONFIRMAR,
      `Sugerencia del sistema: ${PALABRA_DE_SUGERENCIA[sugerencia.state]}`,
      ...sugerencia.reasons,
    ],
  };
}

/** Los módulos, como estados que `programApprovalState` entiende. */
export function modulosAfirmados(confirmados: readonly (ResultadoFinal | null)[]): ModuleState[] {
  return confirmados.map((c) => c ?? "pendiente");
}

/**
 * La especialización desde sus módulos CONFIRMADOS: la MISMA regla de
 * programa (`programApprovalState`), con "sin confirmar" como `pendiente`.
 */
export function programaConfirmado(confirmados: readonly (ResultadoFinal | null)[]): {
  state: ApprovalState;
  reasons: string[];
} {
  const r = programApprovalState(modulosAfirmados(confirmados));
  const sinConfirmar = confirmados.filter((c) => c === null).length;
  if (r.state !== "pendiente" || sinConfirmar === 0) return r;
  return {
    state: "pendiente",
    reasons: [
      sinConfirmar === 1
        ? "Falta confirmar el resultado de un módulo"
        : `Falta confirmar el resultado de ${sinConfirmar} módulos`,
    ],
  };
}

/**
 * - `anulado`: anulado a mano (`revoked_at`), con su fecha.
 * - `anulado_sin_asistencia`: su grupo terminó INCOMPLETO; se trata como
 *   anulado al leer (no se toca la fila). Si algún día se completa la
 *   asistencia y se confirma "aprobado", vuelve a valer.
 * - `suspendido`: grupo completo, resultado sin confirmar como aprobado.
 */
export type VisibilidadDeCertificado = "valido" | "anulado" | "anulado_sin_asistencia" | "suspendido";

/**
 * Un certificado ya emitido queda SUSPENDIDO mientras el resultado no esté
 * confirmado como aprobado: el alumno no lo ve ni lo descarga y `/verificar`
 * no lo valida. Se decide al LEER: la fila de `certificate` no se toca, y
 * cuando el profesor confirma "aprobado" vuelve a valer solo.
 *
 * Decisión del dueño (2026-10-29): todo arranca desde ahora — la emisión
 * HISTÓRICA no tiene excepción. Si su grupo no tiene la asistencia completa,
 * cuenta como anulado; si la tiene, espera la confirmación como cualquiera.
 */
export function visibilidadDeCertificado(c: {
  revokedAt: Date | string | null;
  /** El estado AFIRMADO de la inscripción (o del programa, en el general). */
  resultado: ApprovalState;
  /** Su grupo (o algún módulo, en el general) terminó incompleto. */
  grupoSinResultado: boolean;
}): VisibilidadDeCertificado {
  if (c.revokedAt) return "anulado";
  if (c.grupoSinResultado) return "anulado_sin_asistencia";
  return c.resultado === "aprobado" ? "valido" : "suspendido";
}

/** El alumno ve el válido y el anulado a mano; nunca el suspendido ni el de grupo incompleto. */
export function certificadoVisibleParaElAlumno(v: VisibilidadDeCertificado): boolean {
  return v === "valido" || v === "anulado";
}

/** Confirmar "reprobado" anula el certificado vigente (con el mecanismo de siempre). */
export function debeAnularCertificado(input: {
  certificadoVigente: boolean;
  resultado: ResultadoFinal;
}): boolean {
  return input.certificadoVigente && input.resultado === "reprobado";
}

export const MOTIVO_DE_ANULACION_POR_RESULTADO =
  "Resultado final confirmado: reprobado";

/**
 * "Confirmar sugeridos": los que no tienen resultado y cuya sugerencia es un
 * resultado (aprobado o reprobado). Un `pendiente` necesita que alguien elija.
 * Nada de esto corre solo: lo dispara un clic.
 */
export function sugeridosAConfirmar(
  alumnos: readonly {
    enrollmentId: string;
    sugerido: ApprovalState;
    confirmado: ResultadoFinal | null;
  }[]
): { enrollmentId: string; result: ResultadoFinal }[] {
  return alumnos.flatMap((a) =>
    a.confirmado === null && a.sugerido !== "pendiente"
      ? [{ enrollmentId: a.enrollmentId, result: a.sugerido }]
      : []
  );
}

/** El cuerpo de PUT `.../final-results` (staff y profesor), para `parseBody`. */
export const confirmacionesSchema = z
  .object({
  entries: z
    .array(
      z.object({
        enrollmentId: z.string().min(1).max(64),
        result: z.enum(["aprobado", "reprobado"]),
        note: z
          .string()
          .max(500)
          .transform((s) => s.trim())
          .optional(),
      })
    )
    .min(1)
    .max(500),
  })
  .refine((b) => new Set(b.entries.map((e) => e.enrollmentId)).size === b.entries.length, {
    message: "Una inscripción aparece dos veces",
    path: ["entries"],
  });

/** Las confirmaciones ya validadas, sin notas vacías. */
export function confirmacionesDelCuerpo(
  body: z.infer<typeof confirmacionesSchema>
): ConfirmacionDeResultado[] {
  return body.entries.map((e) => ({
    enrollmentId: e.enrollmentId,
    result: e.result,
    ...(e.note ? { note: e.note } : {}),
  }));
}

export type ConfirmacionDeResultado = {
  enrollmentId: string;
  result: ResultadoFinal;
  note?: string;
};

/** El cuerpo de PUT `.../final-results`, para las dos puertas (staff y profesor). */
export function validarConfirmaciones(
  body: unknown
): { ok: true; entries: ConfirmacionDeResultado[] } | { ok: false; message: string } {
  const r = confirmacionesSchema.safeParse(body);
  if (!r.success) return { ok: false, message: r.error.issues[0]?.message ?? "Datos inválidos" };
  return { ok: true, entries: confirmacionesDelCuerpo(r.data) };
}

/** El estado AFIRMADO de una inscripción, como lo lee `estadosAfirmados`. */
export type EstadoAfirmado = {
  /** El confirmado, o `pendiente` (también cuando `sinResultado`). */
  state: ApprovalState;
  /** Su grupo (o, en la madre, algún módulo) terminó sin la asistencia completa. */
  sinResultado: boolean;
};

/** `visibilidadDeCertificado` a partir del estado afirmado (sin estado: pendiente). */
export function visibilidadSegun(
  revokedAt: Date | string | null,
  afirmado: EstadoAfirmado | undefined
): VisibilidadDeCertificado {
  return visibilidadDeCertificado({
    revokedAt,
    resultado: afirmado?.state ?? "pendiente",
    grupoSinResultado: afirmado?.sinResultado ?? false,
  });
}
