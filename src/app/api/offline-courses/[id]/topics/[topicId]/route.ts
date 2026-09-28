import { parseBody, requireCapability } from "@/lib/api";
import { topicPatchSchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, deleteTopic, updateTopic } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; topicId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** Title, content, Vimeo URL (""/null = no video), before/after; `lessonId` moves it to another lesson of the course. → `{ id, lessonId }`. */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, topicId } = await ctx.params;
    const body = await parseBody(req, topicPatchSchema);
    if (!body.ok) return body.response;
    return editorResponse(await updateTopic(session.organizationId, id, topicId, body.data));
  }
);

/** 409 `has_history` when a student has progress on it. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, topicId } = await ctx.params;
    return editorResponse(await deleteTopic(session.organizationId, id, topicId));
  }
);
