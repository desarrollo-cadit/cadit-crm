import { classHasEnded } from "@/lib/schedule-time";

/**
 * Horas dictadas: la cuenta EXACTA, una sola para el staff (`teacherHours`) y
 * para el portal del profesor (`teacherOwnHours`).
 *
 * `class_session.hours` es una columna ENTERA (la escribe `hoursFromTimes`,
 * que redondea): una clase de 18:30 a 20:00 quedaba guardada como 2 h. Por eso
 * la duración se calcula del horario de la clase, y la columna guardada sólo
 * se usa cuando la clase no tiene horario.
 *
 * Puro: no lee la base ni el reloj; `now` y la zona los pasa quien llama.
 */

function minutosDelDia(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function minutosDeLaClase(start: string | null | undefined, end: string | null | undefined) {
  const a = minutosDelDia(start);
  const b = minutosDelDia(end);
  if (a === null || b === null || b <= a) return null;
  return b - a;
}

/** Redondeo a dos decimales, sólo para mostrar o devolver; nunca por clase. */
function dosDecimales(n: number): number {
  return Math.round(n * 100) / 100;
}

/** "18:30"–"20:00" → 1.5. Null si falta alguna o el rango no cierra. */
export function exactHoursFromTimes(
  start: string | null | undefined,
  end: string | null | undefined
): number | null {
  const min = minutosDeLaClase(start, end);
  return min === null ? null : dosDecimales(min / 60);
}

/** Lo mínimo de una clase para saber cuántas horas vale. */
export type DuracionDeClase = {
  startTime: string | null;
  endTime: string | null;
  /** La columna entera guardada: respaldo para la clase sin horario. */
  hours: number | null;
};

/** Horas de una clase, sin redondear: del horario si lo tiene, si no lo guardado. */
export function horasDeLaClase(c: DuracionDeClase): number {
  const min = minutosDeLaClase(c.startTime, c.endTime);
  if (min !== null) return min / 60;
  return c.hours ?? 0;
}

/** 1.5 → "1,5"; 2 → "2"; 1.6667 → "1,67". */
export function formatHorasEs(horas: number): string {
  return new Intl.NumberFormat("es-UY", { maximumFractionDigits: 2 }).format(horas);
}

/**
 * Cómo se nombra un grupo en el listado de horas: el curso, y el grupo si
 * tiene nombre. Sin el curso, dos grupos sin nombre eran indistinguibles.
 */
export function etiquetaDeGrupo(courseName: string | null, cohortName: string | null): string {
  const partes = [courseName, cohortName].filter((p): p is string => Boolean(p?.trim()));
  return partes.length ? partes.join(" — ") : "Grupo sin nombre";
}

export type ClaseParaHoras = DuracionDeClase & {
  cohortId: string;
  cohortName: string | null;
  courseName: string | null;
  /** `class_session.date`: medianoche UTC del día de la clase. */
  date: Date;
};

export type HorasPorGrupo = {
  cohortId: string;
  cohortName: string | null;
  courseName: string | null;
  sessions: number;
  hours: number;
  scheduledSessions: number;
  scheduledHours: number;
};

export type ResumenDeHoras = {
  /** Clases DICTADAS: ya terminaron en la zona de la academia. */
  sessions: number;
  hours: number;
  /** Clases programadas: todavía no terminaron. No suman a lo dictado. */
  scheduledSessions: number;
  scheduledHours: number;
  byCohort: HorasPorGrupo[];
};

/**
 * Separa lo dictado de lo programado y suma exacto.
 *
 * "¿Ya se dio?" se pregunta con `classHasEnded` (fin de la clase en la zona de
 * la academia, o el fin del día si no tiene horario): comparar la fecha
 * guardada contra "ahora" da por dictada la clase de mañana a las 21:00 de hoy.
 * Las canceladas las filtra quien consulta.
 */
export function resumenDeHoras(
  clases: readonly ClaseParaHoras[],
  timeZone: string,
  now: Date
): ResumenDeHoras {
  const porGrupo = new Map<string, HorasPorGrupo>();
  let sessions = 0;
  let hours = 0;
  let scheduledSessions = 0;
  let scheduledHours = 0;

  for (const c of clases) {
    const h = horasDeLaClase(c);
    const g = porGrupo.get(c.cohortId) ?? {
      cohortId: c.cohortId,
      cohortName: c.cohortName,
      courseName: c.courseName,
      sessions: 0,
      hours: 0,
      scheduledSessions: 0,
      scheduledHours: 0,
    };
    if (classHasEnded({ date: c.date, endTime: c.endTime }, timeZone, now)) {
      g.sessions += 1;
      g.hours += h;
      sessions += 1;
      hours += h;
    } else {
      g.scheduledSessions += 1;
      g.scheduledHours += h;
      scheduledSessions += 1;
      scheduledHours += h;
    }
    porGrupo.set(c.cohortId, g);
  }

  return {
    sessions,
    hours: dosDecimales(hours),
    scheduledSessions,
    scheduledHours: dosDecimales(scheduledHours),
    byCohort: [...porGrupo.values()].map((g) => ({
      ...g,
      hours: dosDecimales(g.hours),
      scheduledHours: dosDecimales(g.scheduledHours),
    })),
  };
}
