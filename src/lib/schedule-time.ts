/**
 * 013 (T006, FR-010b) — Fechas de clase con zona horaria. El único lugar.
 *
 * El problema: `class_session.start_time` es texto (`"18:30"`) sin zona. Eso
 * alcanzaba mientras solo lo miraba coordinación desde Montevideo. Con **42
 * alumnos en Paraguay y 45 en otros países**, componer mal el instante real de
 * una clase no rompe nada visible — simplemente 87 personas llegan tarde.
 *
 * Por eso vive acá, es puro, y está probado contra el horario de verano
 * europeo. **Nadie más compone fechas de clase a mano.**
 *
 * Sin dependencias nuevas (constitución II): `Intl` ya está en el runtime.
 */

/** `"18:30"` → `{ h: 18, m: 30 }`; cualquier otra cosa → `null`. */
function parseHhMm(value: string | null | undefined): { h: number; m: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

/**
 * Cuánto se corre una zona respecto de UTC en un instante dado, en ms.
 *
 * No hay API directa, así que se formatea el instante EN esa zona y se
 * reconstruye como si fuera UTC: la diferencia es el offset. Es el camino
 * estándar sin traerse una biblioteca de zonas horarias.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, number> = {};
  for (const { type, value } of dtf.formatToParts(instant)) {
    if (type !== "literal") p[type] = Number(value);
  }
  // `hour12: false` puede devolver 24 en la medianoche de algunas zonas.
  const hour = p.hour === 24 ? 0 : (p.hour ?? 0);
  const asUtc = Date.UTC(
    p.year ?? 0,
    (p.month ?? 1) - 1,
    p.day ?? 1,
    hour,
    p.minute ?? 0,
    p.second ?? 0
  );
  return asUtc - instant.getTime();
}

/**
 * El instante real en que empieza (o termina) una clase.
 *
 * @param day    el día de la clase (`class_session.date`), leído en UTC
 * @param hhmm   el horario tal como está guardado: `"18:30"`
 * @param timeZone zona IANA de la organización (`organization.timezone`)
 *
 * Devuelve `null` —y no una fecha inventada— cuando el horario falta o no se
 * entiende: **6 de las 41 cohortes reales no tienen horario cargado**, y la
 * pantalla tiene que poder decir "sin horario" en vez de mostrar las 00:00.
 */
export function classInstant(
  day: Date,
  hhmm: string | null | undefined,
  timeZone: string
): Date | null {
  const time = parseHhMm(hhmm);
  if (!time) return null;

  // El día viaja como timestamp; se leen sus componentes en UTC para no
  // arrastrar la zona del servidor, que no tiene nada que ver con la academia.
  const wallUtc = Date.UTC(
    day.getUTCFullYear(),
    day.getUTCMonth(),
    day.getUTCDate(),
    time.h,
    time.m
  );

  try {
    /**
     * Dos pasadas, y la segunda no es paranoia.
     *
     * La primera calcula el offset usando una hora tentativa; si ese instante
     * cae del otro lado de un cambio de horario, el offset es el equivocado.
     * La segunda lo recalcula ya parado en el instante correcto. Sin esto, las
     * clases de la semana del cambio de hora se corren 60 minutos.
     */
    const primera = wallUtc - zoneOffsetMs(new Date(wallUtc), timeZone);
    const segunda = wallUtc - zoneOffsetMs(new Date(primera), timeZone);
    const instant = new Date(segunda);
    return Number.isNaN(instant.getTime()) ? null : instant;
  } catch {
    // Zona inválida: devolver null antes que tumbar el calendario entero.
    return null;
  }
}

/** El horario de pared (`"18:30"`) de un instante, en la zona dada. */
export function formatInZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).format(instant);
}

export type MeetingWindow = { beforeMin: number; afterMin: number };

/**
 * 013 (FR-003/FR-005e) — Si el enlace de la reunión se muestra AHORA.
 *
 * La ventana es configurable por organización (DV-001: 15 antes, 30 después).
 * Un enlace visible todo el día invita a entrar cuando no hay nadie; uno que
 * aparece justo a la hora deja afuera al que llega temprano.
 *
 * `canceled` corta antes que cualquier cuenta de minutos: entrar a la reunión
 * de una clase que no va a existir es peor que no encontrar el enlace.
 */
export function meetingLinkVisible(
  now: Date,
  startsAt: Date | null,
  endsAt: Date | null,
  window: MeetingWindow,
  canceled: boolean
): boolean {
  if (canceled) return false;
  if (!startsAt) return false;

  const desde = startsAt.getTime() - window.beforeMin * 60_000;
  // Sin hora de fin se toma el inicio como referencia: la ventana se cierra
  // igual, en vez de quedar abierta para siempre.
  const base = endsAt ?? startsAt;
  const hasta = base.getTime() + window.afterMin * 60_000;

  const t = now.getTime();
  return t >= desde && t <= hasta;
}
