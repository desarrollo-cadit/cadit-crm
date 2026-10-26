import { classHasEnded, classInstant, formatInZone, wallClockInZone } from "@/lib/schedule-time";

/**
 * 2026-10-26 — La agenda de hoy del inicio: las clases del día como línea de
 * tiempo, con qué terminó, qué está en curso y qué viene, y dónde cae "ahora".
 *
 * Puro. Las fechas se componen SOLO con `classInstant` / `classHasEnded` en la
 * zona de la academia: el navegador de quien mira puede estar en otra zona, y
 * el texto "18:30" no lleva zona.
 */

export type EstadoEnLaAgenda = "terminada" | "en_curso" | "proxima";

export type ClaseDeLaAgenda = {
  /** `class_session.date` en ISO: medianoche UTC del día de la clase. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  projected?: boolean;
};

export type Agenda<T extends ClaseDeLaAgenda> = {
  filas: (T & { estado: EstadoEnLaAgenda })[];
  /** Índice de la fila ANTES de la cual va la línea de ahora (`filas.length` = al final). */
  ahoraAntesDe: number;
  /** "15:42", en la zona de la academia. */
  horaActual: string;
};

export function estadoEnLaAgenda(
  clase: ClaseDeLaAgenda,
  reloj: { timeZone: string; now: Date }
): EstadoEnLaAgenda {
  const dia = new Date(clase.date);
  if (classHasEnded({ date: dia, endTime: clase.endTime }, reloj.timeZone, reloj.now)) return "terminada";
  // Sin horario de inicio no se sabe si empezó: no se inventa "en curso".
  const empieza = classInstant(dia, clase.startTime, reloj.timeZone);
  return empieza && empieza.getTime() <= reloj.now.getTime() ? "en_curso" : "proxima";
}

/** Las clases ya vienen ordenadas por hora de inicio (`dashboardSummary`). */
export function agendaDeHoy<T extends ClaseDeLaAgenda>(
  clases: readonly T[],
  reloj: { timeZone: string; now: Date }
): Agenda<T> {
  const filas = clases.map((c) => ({ ...c, estado: estadoEnLaAgenda(c, reloj) }));
  const primeraProxima = filas.findIndex((f) => f.estado === "proxima");
  return {
    filas,
    ahoraAntesDe: primeraProxima === -1 ? filas.length : primeraProxima,
    horaActual: formatInZone(reloj.now, reloj.timeZone),
  };
}

/**
 * El día de HOY en la academia, con la forma en que se guarda
 * `class_session.date` (medianoche UTC). A las 22:30 de Montevideo ya es el
 * día siguiente en UTC, y la agenda tiene que seguir mostrando el de hoy.
 */
export function diaDeHoyGuardado(now: Date, timeZone: string): Date {
  const fecha = wallClockInZone(now, timeZone)?.fecha ?? now.toISOString().slice(0, 10);
  return new Date(`${fecha}T00:00:00.000Z`);
}
