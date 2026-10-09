/**
 * 030 (addendum) — La duración como se dice: "1 h 52 min", no "112 min".
 *
 * `null` cuando no hay dato (o el dato no tiene sentido): una celda vacía dice
 * la verdad; un "0 min" inventado afirma que la clase no duró nada.
 */
export function formatDuration(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes < 0) return null;
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
