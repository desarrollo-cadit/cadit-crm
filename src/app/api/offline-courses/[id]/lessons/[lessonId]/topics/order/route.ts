import { parseBody, requireCapability } from "@/lib/api";
import { orderBodySchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, reorderTopics } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; lessonId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** `{ ids }` = EVERY topic of the lesson in its new order (422 otherwise). */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, lessonId } = await ctx.params;
    const body = await parseBody(req, orderBodySchema);
    if (!body.ok) return body.response;
    return editorResponse(await reorderTopics(session.organizationId, id, lessonId, body.data.ids));
  }
);
