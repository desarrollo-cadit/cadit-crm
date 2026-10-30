import { z } from "zod";

/**
 * 0089 — Los cuerpos de la importación y de la conciliación. El archivo viaja
 * como multipart (`file`) con estos campos de texto; las acciones sobre un caso
 * viajan como JSON.
 */

/** Oferta de Autodesk (su llave) → programa del campus, o `null` = «no se gestiona». */
export const mapeoDeOfertasSchema = z.record(z.string().min(1).max(200), z.string().min(1).max(64).nullable());
export type MapeoDeOfertas = z.infer<typeof mapeoDeOfertasSchema>;

/** Los campos de texto del multipart de vista previa e importación. */
export const camposDeImportacionSchema = z.object({
  teamId: z.string().min(1).max(64).optional(),
  mapeo: z.string().max(100_000).optional(),
  guardarAlias: z.enum(["true", "false"]).optional(),
});

export const ACCIONES_SOBRE_UN_CASO = [
  "asignar",
  "desmarcar",
  "mover",
  "pendiente_en_autodesk",
  "sacar_en_autodesk",
  "mantener",
  "omitir",
  "vincular",
] as const;

export const accionSobreCasoSchema = z.object({
  teamId: z.string().min(1).max(64),
  /** La llave del caso, tal como la devolvió el reporte. */
  clave: z.string().min(1).max(400),
  accion: z.enum(ACCIONES_SOBRE_UN_CASO),
  /** Para `asignar` a un alumno con más de un curso. */
  enrollmentId: z.string().min(1).max(64).optional(),
  /** Para `mantener` / `omitir`. */
  nota: z.string().trim().max(500).optional(),
  /** Para `vincular`: la persona del campus a la que corresponde el correo. */
  contactId: z.string().min(1).max(64).optional(),
  teacherId: z.string().min(1).max(64).optional(),
});
export type AccionSobreCaso = z.infer<typeof accionSobreCasoSchema>;

export const aplicarLoSeguroSchema = z.object({
  teamId: z.string().min(1).max(64),
  /** Solo contar qué se aplicaría, sin escribir. */
  soloContar: z.boolean().optional(),
});

export const reporteQuerySchema = z.object({
  teamId: z.string().min(1).max(64).optional(),
});
