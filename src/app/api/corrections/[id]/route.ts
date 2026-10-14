import { apiError, requireCapability } from "@/lib/api";
import { detalleParaAprobar } from "@/server/corrections";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 031 (T033) — El detalle de UNA corrección para decidir: la versión en
 * trámite completa, su plantilla, la vigente (para comparar) y la entrega.
 */
export const GET = requireCapability(
  "correcciones.aprobar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await detalleParaAprobar(session.organizationId, id);
    if (!data) return apiError(404, "not_found", "Corrección no encontrada");
    return Response.json(data);
  }
);
