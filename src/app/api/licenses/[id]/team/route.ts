import { apiError, parseBody, requireCapability } from "@/lib/api";
import { moverLicenciaDeEquipo } from "@/server/licenses";
import { moverLicenciaSchema } from "@/lib/license-team";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0088 — Pasa UNA licencia al cupo de otro equipo (estaba cargada en el
 * equivocado). 409 `no_stock` si el destino no tiene un asiento libre y la
 * licencia hoy ocupa uno; 409 `asignado_al_grupo` para las del grupo, que se
 * mueven con el programa. `licencias.gestionar`: es una reasignación.
 */
export const PUT = requireCapability(
  "licencias.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, moverLicenciaSchema);
    if (!body.ok) return body.response;
    const result = await moverLicenciaDeEquipo(session.organizationId, id, body.data.teamId);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ license: result.license });
  }
);
