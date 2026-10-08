import type { OfficeHours } from "@/lib/areas";
import { classInstant } from "@/lib/schedule-time";

/**
 * 029 — Horario de atención de un área.
 *
 * Los días cuentan desde el LUNES (0 = lunes), como `WEEKDAY_LABELS` y
 * `cohort.days_of_week`; las horas son de pared en la zona de la
 * organización. Los instantes se componen con `classInstant()` —el único
 * lugar que convierte "18:00 en Montevideo" en un instante— y no a mano.
 */

const DAY_NAMES = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

/** Día (0 = lunes) y fecha de pared de `now` en la zona dada. */
function localDay(now: Date, timeZone: string): { weekday: number; day: Date } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekdayEn = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"));
  const day = new Date(Date.UTC(Number(get("year")), Number(get("month")) - 1, Number(get("day"))));
  return { weekday: weekdayEn, day };
}

export function isWithinOfficeHours(hours: OfficeHours, now: Date, timeZone: string): boolean {
  const { weekday, day } = localDay(now, timeZone);
  if (!hours.days.includes(weekday)) return false;
  const from = classInstant(day, hours.from, timeZone);
  const to = classInstant(day, hours.to, timeZone);
  if (!from || !to) return true; // horario ilegible: no se inventa "fuera de horario"
  return now >= from && now < to;
}

/** "Montevideo" de "America/Montevideo"; "Buenos Aires" de "America/Argentina/Buenos_Aires". */
export function timeZoneLabel(timeZone: string): string {
  return (timeZone.split("/").pop() ?? timeZone).replace(/_/g, " ");
}

/** "9:00" de "09:00". */
const clock = (hhmm: string) => hhmm.replace(/^0(\d)/, "$1");

function describeDays(days: number[]): string {
  const sorted = [...new Set(days)].sort((a, b) => a - b);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (first === undefined || last === undefined) return "";
  const contiguous = sorted.length > 2 && last - first === sorted.length - 1;
  if (contiguous) return `de ${DAY_NAMES[first]} a ${DAY_NAMES[last]}`;
  const names = sorted.map((d) => DAY_NAMES[d]);
  if (names.length === 1) return `los ${names[0]}`;
  return `los ${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

/** "de lunes a viernes de 9:00 a 18:00 (hora de Montevideo)". */
export function describeOfficeHours(hours: OfficeHours, timeZone: string): string {
  return `${describeDays(hours.days)} de ${clock(hours.from)} a ${clock(hours.to)} (hora de ${timeZoneLabel(timeZone)})`;
}
