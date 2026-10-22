/**
 * 2026-10-22 — ¿Dos grupos del mismo profesor se pisan? (DV-006, revisado)
 *
 * Antes se comparaban SOLO las fechas de inicio y fin: un grupo martes y
 * jueves y otro lunes, miércoles y viernes del mismo profesor "se
 * superponían" siempre que sus meses se cruzaran, aunque nunca compartieran
 * un día. Ahora tienen que coincidir las tres cosas: fechas, al menos un día
 * de la semana y el horario.
 *
 * Si falta un dato (días u horario sin cargar) el choque no se puede
 * descartar y se avisa: es un aviso, no un bloqueo, y callar un choque real
 * cuesta más que un aviso de más.
 */

export type HorarioDeGrupo = {
  startDate: Date;
  /** `null` = sigue en curso una vez empezado (mismo criterio que el estado). */
  endDate: Date | null;
  /** CSV de días, lunes=0 … domingo=6 (`cohort.days_of_week`). */
  daysOfWeek: string | null;
  /** "HH:MM", en la zona de la academia. */
  startTime: string | null;
  endTime: string | null;
};

const FAR_FUTURE = new Date(8640000000000000);

function fechasSeCruzan(a: HorarioDeGrupo, b: HorarioDeGrupo): boolean {
  return a.startDate <= (b.endDate ?? FAR_FUTURE) && (a.endDate ?? FAR_FUTURE) >= b.startDate;
}

function dias(csv: string | null): Set<string> | null {
  const lista = (csv ?? "").split(",").map((d) => d.trim()).filter(Boolean);
  return lista.length > 0 ? new Set(lista) : null;
}

export function horariosSeSuperponen(a: HorarioDeGrupo, b: HorarioDeGrupo): boolean {
  if (!fechasSeCruzan(a, b)) return false;

  const diasA = dias(a.daysOfWeek);
  const diasB = dias(b.daysOfWeek);
  if (diasA && diasB && ![...diasA].some((d) => diasB.has(d))) return false;

  // "HH:MM" con ceros a la izquierda se compara bien como texto. Los bordes
  // no se pisan: una clase que termina 19:00 y otra que empieza 19:00 conviven.
  if (a.startTime && a.endTime && b.startTime && b.endTime) {
    return a.startTime < b.endTime && b.startTime < a.endTime;
  }
  return true;
}
