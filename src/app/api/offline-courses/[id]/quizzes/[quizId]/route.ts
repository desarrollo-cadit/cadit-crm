import { parseBody, requireCapability } from "@/lib/api";
import { quizPatchSchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, deleteQuiz, updateQuiz } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; quizId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** Allowed with attempts: each attempt keeps its score, result and answer snapshot. */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, quizId } = await ctx.params;
    const body = await parseBody(req, quizPatchSchema);
    if (!body.ok) return body.response;
    return editorResponse(await updateQuiz(session.organizationId, id, quizId, body.data));
  }
);

/** 409 `has_history` when it has attempts. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, quizId } = await ctx.params;
    return editorResponse(await deleteQuiz(session.organizationId, id, quizId));
  }
);
