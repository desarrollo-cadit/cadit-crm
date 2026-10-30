import { apiError, parseBody, requireCapability } from "@/lib/api";
import { moverProgramaSchema } from "@/lib/license-team";
import { moverProgramaDeEquipo } from "@/server/license-teams";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0088 — Mueve un programa de ESTE equipo a otro: el cupo y todas sus
 * licencias, y el equipo de los grupos que lo tienen. Si el destino ya tiene
 * el programa responde 409 `programa_en_destino` hasta que se confirme con
 * `sumar`; si el destino quedaría con menos cupo que ocupadas, 422
 * `sin_cupo`. `academico.editar`: es parte de armar los cupos del catálogo.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, moverProgramaSchema);
    if (!body.ok) return body.response;
    const result = await moverProgramaDeEquipo(
      session.organizationId,
      id,
      body.data.softwareId,
      body.data.toTeamId,
      body.data.sumar ?? false
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
