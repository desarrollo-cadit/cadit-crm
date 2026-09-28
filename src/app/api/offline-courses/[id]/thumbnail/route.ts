import { apiError, requireCapability } from "@/lib/api";
import { clearCourseThumbnail, editorResponse, setCourseThumbnail } from "@/server/offline-courses/editor";
import { courseThumbnailAssetId } from "@/server/offline-courses/library";
import { thumbnailResponse } from "@/server/offline-courses/thumbnail";
import { MEDIA_LIMITS } from "@/server/whatsapp/media";

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

/** T11 — Upload/replace (multipart, field `file`; jpeg/png/webp, 5 MB). → `{ thumbnailUrl }`. */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    // Refuse an oversized body before buffering it (multipart overhead allowed).
    if (Number(req.headers.get("content-length") ?? 0) > MEDIA_LIMITS.image.maxBytes + 64 * 1024) {
      return apiError(422, "invalid_image", `Se espera una ${MEDIA_LIMITS.image.label}.`);
    }
    const form = await req.formData().catch(() => null);
    if (!form) return apiError(400, "invalid", "Se esperaba multipart/form-data");
    const file = form.get("file");
    if (!(file instanceof File)) return apiError(422, "invalid_body", "Falta el archivo (campo `file`)");

    const data = Buffer.from(await file.arrayBuffer());
    return editorResponse(
      await setCourseThumbnail(session.organizationId, id, {
        mimeType: file.type || "application/octet-stream",
        sizeBytes: data.byteLength,
        fileName: file.name,
        data,
      })
    );
  }
);

/** T11 — The course goes back to no thumbnail. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    return editorResponse(await clearCourseThumbnail(session.organizationId, id));
  }
);
