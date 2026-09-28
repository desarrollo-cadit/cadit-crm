import { parseBody, requireCapability } from "@/lib/api";
import { lessonBodySchema } from "@/server/offline-courses/editor-logic";
import { editorResponse, createLesson } from "@/server/offline-courses/editor";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/* cursos-offline T11 — library editor. Every nested id is resolved through course `id` (404 otherwise). */

/** New lesson, appended at the end of the course. → 201 `{ id, position }`. */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, lessonBodySchema);
    if (!body.ok) return body.response;
    return editorResponse(await createLesson(session.organizationId, id, body.data), 201);
  }
);
