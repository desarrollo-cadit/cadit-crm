import { apiError } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { attemptsForCohort } from "@/server/offline-courses/attempts";
import { teacherReachesCohort } from "@/server/teacher-portal";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T5) — Offline-course quiz attempts of the cohort's
 * students, as the teacher sees them: score and passed, never the answers.
 * A cohort the teacher does not reach answers 404, like one that does not
 * exist (the scope includes substitutions).
 */
export const GET = requireTeacherPortal(async (ctx, _req: Request, routeCtx: Params) => {
  const { id } = await routeCtx.params;
  if (!(await teacherReachesCohort(ctx.organizationId, ctx.teacherId, id))) {
    return apiError(404, "not_found", "Cohorte no encontrada");
  }
  const attempts = await attemptsForCohort(ctx.organizationId, id);
  return Response.json({ attempts });
});
