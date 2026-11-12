/**
 * Contactos que llegaron por un formulario de captación (curso, campaña o
 * taller) hace poco. Una sola regla para el número de "Alumnos" en el menú
 * (`countRecentFormArrivals`) y el resaltado de la tabla de contactos: si
 * cada uno decidiera la suya, el número y las filas resaltadas no
 * coincidirían.
 *
 * Una llegada deja de ser "nueva" apenas alguien del equipo la trabajó: una
 * `contact_activity` de CUALQUIER tipo (nota, «le escribí por correo / por
 * WhatsApp») posterior a la creación del contacto. Un recordatorio NO cuenta:
 * agendar «llamarlo el jueves» no es haberlo contactado.
 */

export const FORM_ARRIVAL_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Prefijo con el que toda captación pública marca `contact.source`. */
export const FORM_SOURCE_PREFIX = "formulario:";

/**
 * ¿Ya lo trabajó alguien? `ultimaActividad` es el `createdAt` de la última
 * `contact_activity` del contacto (null/ausente si no hay).
 */
export function fueContactado(
  contacto: { createdAt: string | Date },
  ultimaActividad: string | Date | null | undefined
): boolean {
  if (!ultimaActividad) return false;
  return new Date(ultimaActividad).getTime() > new Date(contacto.createdAt).getTime();
}

export function esLlegadaReciente(
  contacto: {
    source: string | null;
    createdAt: string | Date;
    /** Última actividad del equipo sobre el contacto; si ya lo trabajaron, no es nuevo. */
    ultimaActividad?: string | Date | null;
  },
  ahora: Date = new Date()
): boolean {
  if (!contacto.source?.startsWith(FORM_SOURCE_PREFIX)) return false;
  if (fueContactado(contacto, contacto.ultimaActividad)) return false;
  const creado = new Date(contacto.createdAt).getTime();
  return ahora.getTime() - creado <= FORM_ARRIVAL_WINDOW_MS;
}
