import { classInstant, wallClockInZone } from "@/lib/schedule-time";
import { normalizarPayload, type PushPayload } from "@/lib/push/payload";

/**
 * Pure rules of the real push triggers (phase 4): dedupe keys, the minimal
 * text of each notice and the "class about to start" window.
 *
 * Content rule: the lock screen is public. Names of the evaluation and the
 * course are fine; grades, results and amounts NEVER go in a push.
 */

/** Minutes before the start at which a class reminder is sent. */
export const AVISO_DE_CLASE_MIN_DEFAULT = 60;

export const claveDeCorreccionPush = (correctionId: string) => `push:correccion:${correctionId}`;
export const claveDeProrrogaPush = (requestId: string) => `push:prorroga:${requestId}`;
export const claveDeClasePush = (classId: string, contactId: string) =>
  `push:clase:${classId}:${contactId}`;

const cursada = (enrollmentId: string) => `/portal/cursadas/${encodeURIComponent(enrollmentId)}`;

export function contenidoCorreccionPublicada(d: {
  evaluacion: string;
  curso: string;
  enrollmentId: string;
}): PushPayload {
  return normalizarPayload({
    title: "Corrección publicada",
    body: `${d.evaluacion} · ${d.curso}`,
    url: `${cursada(d.enrollmentId)}?tab=evaluaciones`,
    tag: `correccion-${d.enrollmentId}`,
  });
}

export function contenidoProrroga(d: {
  aprobada: boolean;
  evaluacion: string;
  enrollmentId: string;
}): PushPayload {
  return normalizarPayload({
    title: d.aprobada ? "Prórroga aprobada" : "Prórroga rechazada",
    body: d.evaluacion,
    url: `${cursada(d.enrollmentId)}?tab=evaluaciones`,
    tag: `prorroga-${d.enrollmentId}`,
  });
}

export function contenidoClasePorEmpezar(d: {
  curso: string;
  /** "19:00", already in the academy's time zone. */
  hora: string;
  enrollmentId: string;
}): PushPayload {
  return normalizarPayload({
    title: "Clase por empezar",
    body: `${d.curso} · ${d.hora}`,
    url: cursada(d.enrollmentId),
    tag: `clase-${d.enrollmentId}`,
  });
}

export type ClaseCandidata = {
  id: string;
  cohortId: string;
  /** Day of the class (UTC midnight, as stored). */
  date: Date;
  startTime: string | null;
  canceledAt: Date | null;
};

/**
 * Classes that start inside (now, now + leadMin]. A class without a readable
 * start time has no instant and is skipped (6 of 41 real groups have no
 * schedule): we never invent 00:00. Canceled classes never notify.
 */
export function clasesQueTocan(
  clases: readonly ClaseCandidata[],
  timeZone: string,
  now: Date,
  leadMin: number
): (ClaseCandidata & { inicio: Date; hora: string })[] {
  const limite = now.getTime() + leadMin * 60_000;
  const out: (ClaseCandidata & { inicio: Date; hora: string })[] = [];
  for (const c of clases) {
    if (c.canceledAt) continue;
    const inicio = classInstant(c.date, c.startTime, timeZone);
    if (!inicio) continue;
    const t = inicio.getTime();
    if (t <= now.getTime() || t > limite) continue;
    const hora = wallClockInZone(inicio, timeZone)?.hora;
    if (!hora) continue;
    out.push({ ...c, inicio, hora });
  }
  return out;
}
