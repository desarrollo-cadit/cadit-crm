import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { readMediaFile } from "@/server/whatsapp/media";

/**
 * cursos-offline (T5) — Serving a course thumbnail.
 *
 * The importer stored each thumbnail as a regular `media_asset` + file in
 * `MEDIA_DIR` (T3). `/api/media/<id>` asks for `inbox.ver`, which neither a
 * student nor every academic staff member has, so the library serves the
 * file through two routes of its own: the staff one (`academico.ver`) and the
 * portal one (effective access). Both decide WHO may see it and then call
 * this; the file path comes from the same `readMediaFile` the inbox uses.
 *
 * `null` = nothing to serve (unknown asset, not an image, not downloaded, or
 * missing on disk) → the route answers 404.
 */
export async function thumbnailResponse(orgId: string, assetId: string): Promise<Response | null> {
  const [asset] = await getDb()
    .select({
      mimeType: schema.mediaAsset.mimeType,
      fetchStatus: schema.mediaAsset.fetchStatus,
      storagePath: schema.mediaAsset.storagePath,
    })
    .from(schema.mediaAsset)
    .where(scoped(schema.mediaAsset.organizationId, orgId, eq(schema.mediaAsset.id, assetId)))
    .limit(1);

  if (!asset || asset.fetchStatus !== "available" || !asset.storagePath) return null;
  // A thumbnail is an image; anything else stored under that id is not
  // something this route should hand out.
  if (!asset.mimeType?.startsWith("image/")) return null;

  let data: Buffer;
  try {
    data = await readMediaFile(orgId, assetId);
  } catch {
    return null;
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": asset.mimeType,
      "content-length": String(data.byteLength),
      // Private: it went through an access check, a shared cache must not keep it.
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
