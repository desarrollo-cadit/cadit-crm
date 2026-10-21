import {
  cuentaComoPresente,
  type AttendanceStatus,
  type EstadoDeClase,
} from "@/lib/attendance-percentage";

/**
 * 2026-10-21 — Reglas puras de la planilla de asistencia del staff (y del
 * atajo del portal del profesor): sin React, para poder probarlas.
 */

export const ESTADOS_DE_ASISTENCIA: readonly AttendanceStatus[] = [
  "presente",
  "tarde",
  "ausente",
  "justificado",
];

export const NOMBRE_DE_ESTADO: Record<AttendanceStatus, string> = {
  presente: "Presente",
  tarde: "Tarde",
  ausente: "Ausente",
  justificado: "Justificado",
};

export const LETRA_DE_ESTADO: Record<AttendanceStatus, string> = {
  presente: "P",
  tarde: "T",
  ausente: "A",
  justificado: "J",
};

type FilaConMarcas = {
  enrollmentId: string;
  bySession: Partial<Record<string, AttendanceStatus>>;
};

/**
 * "Todos presentes" marca SOLO a quien no tiene marca en esa clase: un ausente
 * o un justificado ya cargado es una decisión de alguien y no se pisa.
 */
export function sinMarcarEnLaClase<T extends FilaConMarcas>(
  alumnos: readonly T[],
  sessionId: string
): T[] {
  return alumnos.filter((a) => !a.bySession[sessionId]);
}

/** Se ofrece en clases dictadas o de hoy, y solo si queda alguien sin marcar. */
export function admiteTodosPresentes(estado: EstadoDeClase, sinMarcar: number): boolean {
  return (estado === "dictada" || estado === "hoy") && sinMarcar > 0;
}

/** El MISMO texto en la planilla del staff y en la del portal del profesor. */
export function textoTodosPresentes(n: number): string {
  return n === 1
    ? "Marcar como presente al alumno sin registrar"
    : `Marcar como presentes a los ${n} alumnos sin registrar`;
}

/** Pie de la planilla: cuántos vinieron a esa clase sobre cuántos alumnos hay. */
export function presentesDeLaClase(
  alumnos: readonly FilaConMarcas[],
  sessionId: string
): { presentes: number; total: number } {
  return {
    presentes: alumnos.filter((a) => cuentaComoPresente(a.bySession[sessionId])).length,
    total: alumnos.length,
  };
}

export type NivelDePorcentaje = "sin_datos" | "sin_minimo" | "bajo" | "ok";

/** Cómo se pinta el % contra el mínimo del grupo. */
export function nivelDePorcentaje(pct: number | null, minimo: number | null): NivelDePorcentaje {
  if (pct === null) return "sin_datos";
  if (minimo === null) return "sin_minimo";
  return pct < minimo ? "bajo" : "ok";
}

/** `"{alumno}, {fecha}: Presente"` — lo que lee un lector de pantalla en la celda. */
export function etiquetaDeCelda(
  alumno: string,
  fecha: string,
  status: AttendanceStatus | null
): string {
  return `${alumno}, ${fecha}: ${status ? NOMBRE_DE_ESTADO[status] : "Sin registrar"}`;
}

/** El atajo de teclado (espacio) recorre P → T → A → J → P. */
export function siguienteEstado(status: AttendanceStatus | null): AttendanceStatus {
  if (!status) return "presente";
  const i = ESTADOS_DE_ASISTENCIA.indexOf(status);
  return ESTADOS_DE_ASISTENCIA[(i + 1) % ESTADOS_DE_ASISTENCIA.length] ?? "presente";
}
