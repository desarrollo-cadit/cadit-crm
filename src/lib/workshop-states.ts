/**
 * 033 — Los vocabularios de un taller, sin dependencias.
 *
 * Vive aparte de `lib/workshops.ts` porque lo importa el esquema, y drizzle-kit
 * carga `schema.ts` fuera de Next: una importación de VALOR tiene que
 * resolverse sin el alias `@/` (mismo motivo que `course-kind.ts`).
 */

/** 033 (FR-002) — Cómo se dicta una edición de taller. */
export const WORKSHOP_MODALITIES = ["online", "presencial"] as const;
export type WorkshopModality = (typeof WORKSHOP_MODALITIES)[number];

/**
 * 033 (FR-002) — Si la edición acepta inscripciones. `cancelada` es la
 * academia suspendiendo el taller: deja de salir en la web y no se reabre
 * sola, pero los inscriptos conservan su historia.
 */
export const WORKSHOP_REGISTRATION_STATUSES = ["abierta", "cerrada", "cancelada"] as const;
export type WorkshopRegistrationStatus = (typeof WORKSHOP_REGISTRATION_STATUSES)[number];

/** 033 (FR-012) — El estado de cada persona anotada. */
export const WORKSHOP_ATTENDEE_STATUSES = [
  "anotado",
  "confirmado",
  "asistio",
  "no_asistio",
  "cancelado",
] as const;
export type WorkshopAttendeeStatus = (typeof WORKSHOP_ATTENDEE_STATUSES)[number];

/** 033 (FR-011) — De dónde llegó la inscripción. */
export const WORKSHOP_SOURCES = ["web", "manual"] as const;
export type WorkshopSource = (typeof WORKSHOP_SOURCES)[number];
