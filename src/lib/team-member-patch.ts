import { z } from "zod";

/**
 * El cuerpo de `PATCH /api/settings/team/[memberId]`: cambiar el rol O
 * encender/apagar los avisos internos por correo, nunca los dos en el mismo
 * pedido (cada uno tiene sus reglas y su mensaje de error).
 *
 * Vive acá y no en la ruta porque un archivo de ruta de Next solo puede
 * exportar los manejadores, y el esquema se prueba solo.
 */
export const memberPatchSchema = z.union([
  z.object({ roleId: z.string().trim().min(1).max(64) }).strict(),
  z.object({ receivesInternalNotices: z.boolean() }).strict(),
]);

export type MemberPatch = z.infer<typeof memberPatchSchema>;
