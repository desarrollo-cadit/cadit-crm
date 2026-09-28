import { parseBody, requireCapability } from "@/lib/api";
import { questionBodySchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, createQuestion } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; quizId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** New question with its answers (≥ 2; single = exactly one correct, multiple ≥ 1). → 201 `{ id, position }`. */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, quizId } = await ctx.params;
    const body = await parseBody(req, questionBodySchema);
    if (!body.ok) return body.response;
    return editorResponse(await createQuestion(session.organizationId, id, quizId, body.data), 201);
  }
);
