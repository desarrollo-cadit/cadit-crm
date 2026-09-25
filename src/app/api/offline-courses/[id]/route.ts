import { apiError, requireCapability } from "@/lib/api";
import { courseDetail } from "@/server/offline-courses/library";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T4) — One library course, read-only, WITH the correct
 * answers. Staff only: the student portal has its own route and never sees
 * `isCorrect`.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const course = await courseDetail(session.organizationId, id);
    if (!course) return apiError(404, "not_found", "Curso no encontrado");
    return Response.json({ course });
  }
);
