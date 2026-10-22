import { apiError, requireCapability } from "@/lib/api";
import { previsualizarBajaCamada } from "@/server/courses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Qué pasaría si se borra el grupo (la MISMA decisión que `DELETE
 * /api/cohorts/[id]`), sin tocar nada: el diálogo lo dice antes de confirmar.
 * Misma capacidad que el borrado.
 */
export const GET = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const decision = await previsualizarBajaCamada(session.organizationId, id);
    if (!decision) return apiError(404, "not_found", "Grupo no encontrado");
    return Response.json({ decision });
  }
);
