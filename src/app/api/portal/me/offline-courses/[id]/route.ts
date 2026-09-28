import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { myCourse } from "@/server/offline-courses/student";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T5) — One course: lessons → topics and the quizzes.
 * A course this student cannot read answers 404, like one that does not exist.
 */
export const GET = requireStudentPortal(async (ctx, _req: Request, routeCtx: Params) => {
  const { id } = await routeCtx.params;
  const course = await myCourse(ctx.organizationId, ctx.contactId, id);
  if (!course) return apiError(404, "not_found", "Curso no encontrado");
  return Response.json({ course });
});
