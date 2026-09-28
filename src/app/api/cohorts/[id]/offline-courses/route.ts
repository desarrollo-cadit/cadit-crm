import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { cohortCourses, setCohortCourses } from "@/server/offline-courses/access";
import { listCourses } from "@/server/offline-courses/library";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T4) — Which library courses the whole cohort inherits.
 * GET brings the library too, so the tab draws its multi-check in one trip.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const assigned = await cohortCourses(session.organizationId, id);
    if (!assigned) return apiError(404, "not_found", "Cohorte no encontrada");
    const courses = await listCourses(session.organizationId);
    return Response.json({ courseIds: assigned, courses });
  }
);

const putSchema = z.object({
  courseIds: z.array(z.string().min(1).max(64)).max(200),
});

/** Replaces the set. Unknown course ids → 422 and nothing is written. */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, putSchema);
    if (!body.ok) return body.response;

    const result = await setCohortCourses(
      session.organizationId,
      id,
      body.data.courseIds,
      session.userId
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
