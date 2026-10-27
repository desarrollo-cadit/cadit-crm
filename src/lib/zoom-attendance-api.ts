import { z } from "zod";

/**
 * Asistencia sugerida desde Zoom — los cuerpos de las rutas (Zod), puros
 * para poder probarlos sin levantar la ruta.
 */

const llave = z.string().min(1).max(300);

/** `POST /api/class-sessions/[id]/zoom-attendance`: traer (o elegir la reunión). */
export const traerSchema = z
  .object({
    /** Una de las candidatas de una traída "ambigua". */
    instanceUuid: z.string().min(1).max(200).optional(),
  })
  .strict();

/** `POST /api/class-sessions/[id]/zoom-attendance/confirm`. */
export const confirmarSchema = z
  .object({
    decisions: z
      .array(
        z
          .object({
            enrollmentId: z.string().min(1),
            status: z.enum(["presente", "tarde", "ausente", "justificado"]),
            /** Las personas de Zoom que son este alumno (sugeridas o asignadas). */
            personaKeys: z.array(llave).max(20),
          })
          .strict()
      )
      .max(300),
    /** "Es del equipo o un dispositivo". */
    ignore: z.array(llave).max(300).default([]),
    /** "No es esta persona", sin reasignar. */
    rejected: z.array(llave).max(300).default([]),
    /** Pisar a propósito una marca que ya existía. */
    overwrite: z.array(z.string().min(1)).max(300).default([]),
  })
  .strict()
  .refine((b) => new Set(b.decisions.map((d) => d.enrollmentId)).size === b.decisions.length, {
    message: "Cada persona del grupo va una sola vez.",
  });

export type ConfirmarBody = z.infer<typeof confirmarSchema>;

/** `PUT /api/settings/zoom/attendance`: umbrales de la organización. */
export const umbralesSchema = z
  .object({
    minPct: z.number().int().min(1, "El porcentaje va de 1 a 100.").max(100, "El porcentaje va de 1 a 100."),
    minMinutes: z.number().int().min(0, "Los minutos no pueden ser negativos.").max(600, "Como mucho 600 minutos."),
    /** null = nunca sugerir "tarde". */
    lateMinutes: z.number().int().min(1).max(180).nullable(),
  })
  .strict();
