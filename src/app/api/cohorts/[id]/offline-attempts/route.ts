import { apiError, requireCapability } from "@/lib/api";
import { cohortExists } from "@/server/offline-courses/access";
import { attemptsForCohort } from "@/server/offline-courses/attempts";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** cursos-offline (T4) — Quiz attempts of the cohort's students: score and passed only. */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    if (!(await cohortExists(session.organizationId, id))) {
      return apiError(404, "not_found", "Cohorte no encontrada");
    }
    const attempts = await attemptsForCohort(session.organizationId, id);
    return Response.json({ attempts });
  }
);
