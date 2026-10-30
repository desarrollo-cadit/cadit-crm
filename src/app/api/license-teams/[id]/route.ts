import { apiError, parseBody, requireCapability } from "@/lib/api";
import { equipoEdicionSchema } from "@/lib/license-team";
import { editarEquipo } from "@/server/license-teams";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0087 — Renombrar un equipo, cambiar su alias de Autodesk o archivarlo.
 * Archivar un equipo con licencias ocupadas (o que es el de un grupo) responde
 * 409 `equipo_en_uso`. `academico.editar`.
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, equipoEdicionSchema);
    if (!body.ok) return body.response;
    const result = await editarEquipo(session.organizationId, id, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ team: result.data });
  }
);
