import { apiError, requireCapability } from "@/lib/api";
import { listCohortClasses } from "@/server/classes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 013 (T012, FR-004/FR-005) — Las clases de una cohorte, reales o proyectadas.
 *
 * Reemplaza la fuente del calendario, que hasta acá leía `/api/cohorts` y
 * dibujaba los días de la semana declarados: una clase cancelada seguía
 * apareciendo porque nadie miraba `class_session`.
 *
 * `academico.ver` y no `asistencia.ver`: esto es el cronograma del curso, no
 * quién vino. Soporte lo necesita tanto como coordinación.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await listCohortClasses(session.organizationId, id);
    if (!result) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json(result);
  }
);
