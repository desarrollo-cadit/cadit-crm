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
