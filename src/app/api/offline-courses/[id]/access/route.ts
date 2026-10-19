import { apiError, requireCapability } from "@/lib/api";
import { courseAccessList } from "@/server/offline-courses/grants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 043 — "Quiénes tienen acceso": cada fuente de acceso al curso (cohorte,
 * otorgado a una inscripción, acceso directo), con su fecha y si venció.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const rows = await courseAccessList(session.organizationId, id);
    if (!rows) return apiError(404, "not_found", "Curso no encontrado");
    return Response.json({ rows });
  }
);
