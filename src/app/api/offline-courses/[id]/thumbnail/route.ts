import { apiError, requireCapability } from "@/lib/api";
import { courseThumbnailAssetId } from "@/server/offline-courses/library";
import { thumbnailResponse } from "@/server/offline-courses/thumbnail";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * cursos-offline (T5) — A course's thumbnail for staff. The stored URL points
 * at `/api/media`, which asks for `inbox.ver`; the library only needs
 * `academico.ver`, so it serves the same file through here.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const assetId = await courseThumbnailAssetId(session.organizationId, id);
    const res = assetId ? await thumbnailResponse(session.organizationId, assetId) : null;
    return res ?? apiError(404, "not_found", "Imagen no encontrada");
  }
);
