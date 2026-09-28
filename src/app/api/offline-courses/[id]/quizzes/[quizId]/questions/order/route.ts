import { parseBody, requireCapability } from "@/lib/api";
import { orderBodySchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, reorderQuestions } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; quizId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** `{ ids }` = EVERY question of the quiz in its new order (422 otherwise). */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, quizId } = await ctx.params;
    const body = await parseBody(req, orderBodySchema);
    if (!body.ok) return body.response;
    return editorResponse(await reorderQuestions(session.organizationId, id, quizId, body.data.ids));
  }
);
