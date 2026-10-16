import { apiError, requireCapability } from "@/lib/api";
import { quitarDelGrupo } from "@/server/group-licenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; softwareId: string }> };

/**
 * 035 (FR-005) — Quita el programa del grupo y libera las licencias DEL
 * GRUPO de ese programa en la cohorte; las individuales no se tocan.
 * `academico.editar`, como liberar una licencia por alumno (FR-021).
 */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, softwareId } = await ctx.params;
    const result = await quitarDelGrupo(session.organizationId, id, softwareId);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
