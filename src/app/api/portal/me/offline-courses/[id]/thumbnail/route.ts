import { apiError } from "@/lib/api";
import { requireStudentPortal } from "@/lib/portal-api";
import { myCourseThumbnailAssetId } from "@/server/offline-courses/student";
import { thumbnailResponse } from "@/server/offline-courses/thumbnail";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T5) — A course's thumbnail, for a student who can read the
 * course. `/api/media` asks for a staff capability; this route asks for
 * effective access instead. No access, no thumbnail or no file → 404.
 */
export const GET = requireStudentPortal(async (ctx, _req: Request, routeCtx: Params) => {
  const { id } = await routeCtx.params;
  const assetId = await myCourseThumbnailAssetId(ctx.organizationId, ctx.contactId, id);
  const res = assetId ? await thumbnailResponse(ctx.organizationId, assetId) : null;
  return res ?? apiError(404, "not_found", "Imagen no encontrada");
});
