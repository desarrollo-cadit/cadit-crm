import { parseBody, requireCapability } from "@/lib/api";
import { questionPatchSchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, deleteQuestion, updateQuestion } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; quizId: string; questionId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** `answers` replaces the set (entries with `id` update, without `id` are new, missing ones are removed). */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, quizId, questionId } = await ctx.params;
    const body = await parseBody(req, questionPatchSchema);
    if (!body.ok) return body.response;
    return editorResponse(await updateQuestion(session.organizationId, id, quizId, questionId, body.data));
  }
);

/** Attempts keep their own snapshot of the question. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, quizId, questionId } = await ctx.params;
    return editorResponse(await deleteQuestion(session.organizationId, id, quizId, questionId));
  }
);
