/**
 * Contactos que llegaron por un formulario de captación (curso, campaña o
 * taller) hace poco. Una sola regla para el número de "Alumnos" en el menú
 * (`countRecentFormArrivals`) y el resaltado de la tabla de contactos: si
 * cada uno decidiera la suya, el número y las filas resaltadas no
 * coincidirían.
 */

export const FORM_ARRIVAL_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Prefijo con el que toda captación pública marca `contact.source`. */
export const FORM_SOURCE_PREFIX = "formulario:";

export function esLlegadaReciente(
  contacto: { source: string | null; createdAt: string | Date },
  ahora: Date = new Date()
): boolean {
  if (!contacto.source?.startsWith(FORM_SOURCE_PREFIX)) return false;
  const creado = new Date(contacto.createdAt).getTime();
  return ahora.getTime() - creado <= FORM_ARRIVAL_WINDOW_MS;
}
