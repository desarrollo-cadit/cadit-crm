import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { deleteRole, renameRole, updateRoleCapabilities } from "@/server/roles";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Crear-roles — El PATCH cambia el nombre O las capacidades, una cosa por
 * pedido. Con las dos juntas, un rechazo de la segunda dejaría la primera
 * guardada (devolver una `Response` de error no revierte la transacción), y
 * la pantalla nunca manda las dos a la vez.
 */
const patchSchema = z
  .object({
    name: z.string().optional(),
    capabilities: z.array(z.string()).max(100).optional(),
  })
  .refine((b) => (b.name === undefined) !== (b.capabilities === undefined), {
    message: "Indicá el nombre o las capacidades, no las dos cosas",
  });

/**
 * 012 (T020) — Edita las capacidades de un rol.
 *
 * El esquema acepta `string[]` y no el enum de capacidades a propósito: si
 * llegara una capacidad que ya no existe, un enum de Zod responde 422 y el
 * usuario no puede guardar NADA. El servidor descarta las desconocidas
 * (`sanitizeCapabilities`) y guarda el resto, que es lo que la persona quiso.
 *
 * Crear-roles — También renombra (`renameRole`).
 */
export const PATCH = requireCapability(
  "configuracion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const result =
      body.data.name !== undefined
        ? await renameRole(session.organizationId, id, session.role, body.data.name)
        : await updateRoleCapabilities(
            session.organizationId,
            id,
            session.role,
            sessionCapabilities(session),
            body.data.capabilities
          );
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ role: result.data });
  }
);

/**
 * Crear-roles — Borra un rol creado por la organización. Los de sistema y los
 * que alguna cuenta tiene asignado responden 409 con el motivo
 * (`deleteRole`); la ruta solo elige el código.
 */
export const DELETE = requireCapability(
  "configuracion.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await deleteRole(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ ok: true, id: result.data.id });
  }
);
