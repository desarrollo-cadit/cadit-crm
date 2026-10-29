/**
 * 2026-10-29 — El RESULTADO de una cursada tal como se le informa a un
 * tercero (la empresa): la pantalla de `/empresas`, su CSV y la constancia en
 * PDF lo deciden con ESTA función, para que nunca digan cosas distintas.
 *
 * Regla del dueño (2026-10-23): **ninguna aprobación es automática**. El
 * estado calculado (`approvalState`, notas + asistencia) es una sugerencia;
 * "Aprobado" o "Reprobado" solo se afirman con el resultado final que
 * CONFIRMÓ el profesor. Bug que corrige: un alumno de un grupo EN CURSO, sin
 * evaluaciones obligatorias y con buena asistencia, figuraba "Aprobado".
 *
 * Puro: no lee la base ni el reloj. El estado del grupo lo trae quien llama
 * (`computeCohortStatus` al corte).
 */

export type EstadoDeGrupo = "planificada" | "en_curso" | "finalizada";

export type ResultadoConfirmado = "aprobado" | "reprobado" | null;

export type ResultadoDeCursada =
  | "por_comenzar"
  | "en_curso"
  | "aprobado"
  | "reprobado"
  | "pendiente"
  | "sin_datos";

export function resultadoDeCursada(input: {
  /** `null` = la inscripción no tiene grupo: no hay nada que decir. */
  estadoDelGrupo: EstadoDeGrupo | null;
  /** El resultado final confirmado por el profesor; `null` = sin confirmar. */
  resultadoConfirmado: ResultadoConfirmado;
}): ResultadoDeCursada {
  if (input.estadoDelGrupo === null) return "sin_datos";
  if (input.estadoDelGrupo === "planificada") return "por_comenzar";
  // Mientras el grupo no terminó no hay resultado, aunque alguien lo haya cargado.
  if (input.estadoDelGrupo === "en_curso") return "en_curso";
  return input.resultadoConfirmado ?? "pendiente";
}

export const ETIQUETA_DE_RESULTADO: Record<ResultadoDeCursada, string> = {
  por_comenzar: "Por comenzar",
  en_curso: "En curso",
  aprobado: "Aprobado",
  reprobado: "Reprobado",
  pendiente: "Resultado pendiente",
  sin_datos: "Sin datos",
};

/**
 * "X de Y clases (Z%)": Y son las clases dictadas que CUENTAN para esa
 * persona (la regla única de `attendance-percentage.ts`), no las planificadas.
 * En curso se aclara "hasta hoy" (o hasta el corte) para que el número no se
 * lea como el total del curso. Sin clases que cuenten: `null`.
 */
export function textoDeAsistencia(
  a: { presentes: number; cuentan: number; pct: number | null },
  enCurso: boolean,
  hasta = "hoy"
): string | null {
  if (a.cuentan === 0 || a.pct === null) return null;
  const clases = a.cuentan === 1 ? "clase" : "clases";
  const base = `${a.presentes} de ${a.cuentan} ${clases} (${a.pct}%)`;
  return enCurso ? `${base} hasta ${hasta}` : base;
}
