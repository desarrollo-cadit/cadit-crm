import { apiError, requireCapability } from "@/lib/api";
import { previsualizarClon } from "@/server/clonar-grupo";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * "Clonar grupo" — Qué se va a copiar y desde qué fechas sugerir. Misma
 * capacidad que crear un grupo (`POST /api/cohorts`): solo lo pide el diálogo
 * de quien puede clonar.
 */
export const GET = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await previsualizarClon(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
