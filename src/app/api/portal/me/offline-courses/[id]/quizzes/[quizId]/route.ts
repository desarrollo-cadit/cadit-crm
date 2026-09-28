import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { myQuiz } from "@/server/offline-courses/student";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; quizId: string }> };

/**
 * cursos-offline (T5) — A quiz to take: questions and answer texts, attempts
 * left and the student's own history. The answer key does not travel.
 */
export const GET = requireStudentPortal(async (ctx, _req: Request, routeCtx: Params) => {
  const { id, quizId } = await routeCtx.params;
  const quiz = await myQuiz(ctx.organizationId, ctx.contactId, id, quizId);
  if (!quiz) return apiError(404, "not_found", "Cuestionario no encontrado");
  return Response.json({ quiz });
});
