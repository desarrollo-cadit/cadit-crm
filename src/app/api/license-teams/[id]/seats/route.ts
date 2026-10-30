import { apiError, parseBody, requireCapability } from "@/lib/api";
import { cuposSchema } from "@/lib/license-team";
import { fijarCupos } from "@/server/license-teams";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0087 — Fija el cupo del equipo en varios programas, todo o nada. Bajar un
 * cupo por debajo de lo que el equipo ya ocupa responde 422 y no escribe
 * ninguno. `academico.editar`: el cupo es parte del catálogo de licencias.
 */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, cuposSchema);
    if (!body.ok) return body.response;
    const result = await fijarCupos(session.organizationId, id, body.data.seats);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
