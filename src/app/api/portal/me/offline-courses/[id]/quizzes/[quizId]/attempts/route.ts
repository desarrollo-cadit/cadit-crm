import { apiError, parseBody } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { validateSubmission } from "@/server/offline-courses/logic";
import { submitAttempt } from "@/server/offline-courses/submit";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; quizId: string }> };

/**
 * cursos-offline (T5) — The student submits a quiz attempt.
 *
 * Answers `{ scorePercentage, passed, attemptNumber, attemptsRemaining }` and
 * nothing else: which questions were right never leaves the server.
 * 404 for a course/quiz out of reach, 409 when no attempts are left or a
 * concurrent submission took the same attempt number, 422 for a bad body.
 */
export const POST = requireStudentPortal(async (ctx, req: Request, routeCtx: Params) => {
  const { id, quizId } = await routeCtx.params;
  const parsed = await parseBody(req, validateSubmission);
  if (!parsed.ok) return parsed.response;
  const r = await submitAttempt(ctx.organizationId, ctx.contactId, id, quizId, parsed.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ result: r.data }, { status: 201 });
});
