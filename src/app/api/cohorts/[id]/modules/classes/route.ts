import { apiError, requireCapability } from "@/lib/api";
import { listProgramClassesRotuladas } from "@/server/classes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 029 — Las clases de TODOS los módulos de una especialización, agrupadas
 * por módulo y rotuladas "Módulo N — nombre". Es lo que muestra la pestaña
 * Clases de la madre, que antes quedaba vacía (la madre no tiene clases
 * propias, DV-009).
 *
 * `academico.ver`, la misma capacidad que `/api/cohorts/[id]/classes`: es el
 * cronograma del curso, no quién vino.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await listProgramClassesRotuladas(session.organizationId, id);
    if (!result) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json(result);
  }
);
