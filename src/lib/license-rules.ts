import { computeCohortStatus } from "./cohort-status";

/**
 * 034 (US5, FR-020..FR-024) — Varias licencias por inscripción.
 *
 * Hasta 033 `license.enrollment_id` era UNIQUE: una inscripción, una licencia.
 * El paquete de una especialización con Revit, Navisworks y AutoCAD no se podía
 * cargar. Desde la 0057 la regla es UNA por programa (`enrollment_id`,
 * `software_id`), y estas son las dos reglas puras que la acompañan.
 */

/**
 * Lo que mostraban las pantallas viejas (`licenseAssigned` +
 * `licenseSoftwareId`) se sigue armando, más la lista completa. Las filas con
 * `assigned = false` (licencia liberada) no cuentan: la fila se conserva para
 * que reasignar el mismo programa la reactive en vez de duplicarla.
 */
export function resumirLicencias(
  licencias: readonly { softwareId: string; assigned: boolean }[]
): { licenseAssigned: boolean; licenseSoftwareId: string | null; licenseSoftwareIds: string[] } {
  const asignadas = licencias.filter((l) => l.assigned).map((l) => l.softwareId);
  return {
    licenseAssigned: asignadas.length > 0,
    licenseSoftwareId: asignadas[0] ?? null,
    licenseSoftwareIds: asignadas,
  };
}

/**
 * Edge case de la spec — el mismo programa en el PAQUETE (la madre) y en un
 * módulo (la hija) está permitido: son inscripciones distintas y cada una
 * descuenta del stock. Pero casi siempre es un error de carga, así que la
 * pantalla lo advierte (no lo bloquea) con los nombres repetidos.
 */
export function licenciasRepetidasEnRecorrido(
  madre: readonly { softwareId: string; softwareName: string }[],
  hija: readonly { softwareId: string; softwareName: string }[]
): string[] {
  const enLaMadre = new Set(madre.map((l) => l.softwareId));
  return [...new Set(hija.filter((l) => enLaMadre.has(l.softwareId)).map((l) => l.softwareName))];
}

/**
 * 023 — ¿Esta licencia está ocupando un lugar del inventario?
 *
 * **Se DERIVA, no se marca.** El booleano `assigned` decía "alguien se la
 * asignó alguna vez"; nunca decía "sigue en uso". Como nadie lo apagaba, una
 * licencia de un curso terminado hace un año seguía descontando del pool para
 * siempre.
 *
 * Ahora ocupa hasta que su cohorte se SABE terminada, y se libera sola cuando
 * termina. Eso vale por sí mismo, pero además tiene una consecuencia que
 * importa: **no hace falta un scheduler**. El estado de la cohorte ya se
 * calcula de sus fechas en cada consulta, así que el día que el curso termina
 * la licencia aparece libre sin que corra ningún proceso.
 *
 * **Fechas desconocidas = no terminó** (2026-10-05). Una inscripción sin
 * cohorte, o una cohorte sin fechas, no prueba que el curso haya terminado:
 * tratarla como libre inflaba el stock disponible en silencio, y el error caía
 * del lado de prometer una licencia que no existe.
 *
 * `expiresAt` gana sobre todo lo demás: una licencia vencida no vuelve a
 * estar disponible por quererlo — Autodesk ya la dio de baja.
 *
 * Pura a propósito: es la regla que decide cuántas licencias se pueden vender.
 */
export function licenciaOcupada(
  licencia: { assigned: boolean; expiresAt: Date | null },
  cohorte: { startDate: Date | null; endDate: Date | null } | null,
  now: Date = new Date()
): boolean {
  if (!licencia.assigned) return false;
  if (licencia.expiresAt && licencia.expiresAt <= now) return false;
  return !cohorteTerminada(cohorte, now);
}

function cohorteTerminada(
  cohorte: { startDate: Date | null; endDate: Date | null } | null,
  now: Date
): boolean {
  if (!cohorte) return false;
  if (cohorte.startDate) {
    return computeCohortStatus(cohorte.startDate, cohorte.endDate, now) === "finalizada";
  }
  return cohorte.endDate !== null && now > cohorte.endDate;
}
