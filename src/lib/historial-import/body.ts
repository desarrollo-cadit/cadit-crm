import { z } from "zod";
import { MapeoSchema } from "@/lib/historial-import/plan";

/**
 * 046 US6 — Los cuerpos de las rutas del importador. La planilla real pesa
 * ~300 KB; el tope de 2 MB deja margen sin aceptar cualquier cosa.
 */
export const MAX_CSV = 2_000_000;

const csv = z.string().min(1, "El archivo está vacío.").max(MAX_CSV, "El archivo es demasiado grande (máximo 2 MB).");

export const analizarBodySchema = z.object({ csv }).strict();
export const vistaPreviaBodySchema = z.object({ csv, mapeo: MapeoSchema }).strict();
export const crearImportacionBodySchema = z
  .object({ csv, mapeo: MapeoSchema, fileName: z.string().trim().max(200).optional() })
  .strict();
