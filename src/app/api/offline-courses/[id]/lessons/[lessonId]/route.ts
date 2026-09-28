import { parseBody, requireCapability } from "@/lib/api";
import { lessonPatchSchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, deleteLesson, updateLesson } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; lessonId: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** Title and content (markdown). */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, lessonId } = await ctx.params;
    const body = await parseBody(req, lessonPatchSchema);
    if (!body.ok) return body.response;
    return editorResponse(await updateLesson(session.organizationId, id, lessonId, body.data));
  }
);

/** 409 `has_history` when any of its topics has student progress. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, lessonId } = await ctx.params;
    return editorResponse(await deleteLesson(session.organizationId, id, lessonId));
  }
);
