import { parseBody, requireCapability } from "@/lib/api";
import { quizBodySchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, createQuiz } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** New quiz of the course (optionally hanging from one of its lessons). → 201 `{ id, position }`. */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, quizBodySchema);
    if (!body.ok) return body.response;
    return editorResponse(await createQuiz(session.organizationId, id, body.data), 201);
  }
);
