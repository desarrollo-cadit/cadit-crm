import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { updateRoleCapabilities } from "@/server/roles";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  capabilities: z.array(z.string()),
});

/**
 * 012 (T020) — Edita las capacidades de un rol.
 *
 * El esquema acepta `string[]` y no el enum de capacidades a propósito: si
 * llegara una capacidad que ya no existe, un enum de Zod responde 422 y el
 * usuario no puede guardar NADA. El servidor descarta las desconocidas
 * (`sanitizeCapabilities`) y guarda el resto, que es lo que la persona quiso.
 */
export const PATCH = requireCapability(
  "configuracion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;

    const result = await updateRoleCapabilities(
      session.organizationId,
      id,
      session.role,
      body.data.capabilities
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ role: result.data });
  }
);
