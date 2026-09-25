import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { myTopic } from "@/server/offline-courses/student";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; topicId: string }> };

/** cursos-offline (T5) — One topic's content, with previous/next in reading order. */
export const GET = requireStudentPortal(async (ctx, _req: Request, routeCtx: Params) => {
  const { id, topicId } = await routeCtx.params;
  const topic = await myTopic(ctx.organizationId, ctx.contactId, id, topicId);
  if (!topic) return apiError(404, "not_found", "Tema no encontrado");
  return Response.json({ topic });
});
