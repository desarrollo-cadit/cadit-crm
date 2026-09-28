import { parseBody, requireCapability } from "@/lib/api";
import { topicBodySchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, createTopic } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; lessonId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** New topic, appended at the end of the lesson; `videoUrl` must be a Vimeo video (422 otherwise). → 201 `{ id, position }`. */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, lessonId } = await ctx.params;
    const body = await parseBody(req, topicBodySchema);
    if (!body.ok) return body.response;
    return editorResponse(await createTopic(session.organizationId, id, lessonId, body.data), 201);
  }
);
