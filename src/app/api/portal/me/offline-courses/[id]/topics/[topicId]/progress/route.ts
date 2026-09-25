import { apiError, parseBody } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { validateProgressReport } from "@/server/offline-courses/logic";
import {
  completeTopicWithoutVideo,
  recordVideoProgress,
} from "@/server/offline-courses/progress";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; topicId: string }> };

/**
 * cursos-offline (T9) — The topic page reports progress: the played ranges of
 * its Vimeo video, or `{ noVideo: true }` for a topic without one.
 *
 * Answers `{ watchedRatio, completed, nextTopicId }`. 404 for a course, topic
 * or LOCKED topic out of reach; 422 for a bad body or a report that does not
 * fit the topic (ranges for a topic without video, or the other way around).
 */
export const POST = requireStudentPortal(async (ctx, req: Request, routeCtx: Params) => {
  const { id, topicId } = await routeCtx.params;
  const parsed = await parseBody(req, validateProgressReport);
  if (!parsed.ok) return parsed.response;

  const r =
    "noVideo" in parsed.data
      ? await completeTopicWithoutVideo(ctx.organizationId, ctx.contactId, id, topicId)
      : await recordVideoProgress(ctx.organizationId, ctx.contactId, id, topicId, parsed.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ progress: r.data });
});
