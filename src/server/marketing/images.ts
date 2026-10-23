import { randomBytes } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { CampaignBodySchema } from "@/lib/marketing/body";
import { sniffImageMime } from "@/server/course-image";
import { deleteMediaFile, MEDIA_LIMITS, readMediaFile, saveMediaFile } from "@/server/whatsapp/media";

/**
 * 045 (DV-013; FR-007a, FR-007b) — Imágenes de una campaña.
 *
 * - En el volumen propio (`MEDIA_DIR`, constitución II: sin S3), como
 *   `marketing-image-<id>`.
 * - El tipo se decide por los BYTES, no por la extensión ni por lo que dice
 *   el navegador. Hasta 5 MB y 20 por campaña, solo en borrador.
 * - Se sirven sin sesión por un token aleatorio de 256 bits: el correo lo
 *   abre cualquiera, y un id adivinable expondría las imágenes de borradores.
 */

export const MAX_IMAGENES_POR_CAMPANA = 20;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

const archivo = (imageId: string) => `marketing-image-${imageId}`;

export function urlPublicaDeImagen(publicToken: string): string {
  return `${getEnv().APP_BASE_URL.replace(/\/+$/, "")}/api/public/marketing/images/${publicToken}`;
}

type Falla<C extends string> = { ok: false; code: C; message: string };

async function estadoDeCampana(orgId: string, campaignId: string) {
  const c = schema.marketingCampaign;
  const [row] = await getDb()
    .select({ status: c.status, body: c.body })
    .from(c)
    .where(scoped(c.organizationId, orgId, eq(c.id, campaignId)))
    .limit(1);
  return row ?? null;
}

const NO_EXISTE = "Esa campaña no existe.";
const NO_EDITABLE = "La campaña ya se envió: no se puede cambiar.";

export async function subirImagen(
  orgId: string,
  userId: string,
  campaignId: string,
  file: { data: Buffer }
): Promise<
  | { ok: true; image: { id: string; url: string; sizeBytes: number } }
  | Falla<"not_found" | "campana_no_editable" | "invalid_body" | "demasiadas_imagenes">
> {
  const campana = await estadoDeCampana(orgId, campaignId);
  if (!campana) return { ok: false, code: "not_found", message: NO_EXISTE };
  if (campana.status !== "borrador") return { ok: false, code: "campana_no_editable", message: NO_EDITABLE };

  const limite = MEDIA_LIMITS.image;
  const mime = sniffImageMime(file.data);
  if (!mime || !limite.mimes.test(mime) || file.data.byteLength > limite.maxBytes) {
    return { ok: false, code: "invalid_body", message: "Se espera imagen (jpeg/png/webp, máx. 5 MB)" };
  }

  const img = schema.marketingImage;
  const [{ total } = { total: 0 }] = await getDb()
    .select({ total: count() })
    .from(img)
    .where(scoped(img.organizationId, orgId, eq(img.campaignId, campaignId)));
  if (Number(total) >= MAX_IMAGENES_POR_CAMPANA) {
    return {
      ok: false,
      code: "demasiadas_imagenes",
      message: `Una campaña puede tener hasta ${MAX_IMAGENES_POR_CAMPANA} imágenes.`,
    };
  }

  const id = newId("marketingImage");
  const publicToken = randomBytes(32).toString("base64url");
  await saveMediaFile(orgId, archivo(id), file.data);
  await getDb().insert(img).values({
    id,
    organizationId: orgId,
    campaignId,
    publicToken,
    mimeType: mime as "image/jpeg" | "image/png" | "image/webp",
    sizeBytes: file.data.byteLength,
    createdBy: userId,
  });
  return { ok: true, image: { id, url: urlPublicaDeImagen(publicToken), sizeBytes: file.data.byteLength } };
}

export async function borrarImagen(
  orgId: string,
  campaignId: string,
  imageId: string
): Promise<{ ok: true } | Falla<"not_found" | "campana_no_editable" | "imagen_en_uso">> {
  const campana = await estadoDeCampana(orgId, campaignId);
  if (!campana) return { ok: false, code: "not_found", message: NO_EXISTE };
  if (campana.status !== "borrador") return { ok: false, code: "campana_no_editable", message: NO_EDITABLE };

  const img = schema.marketingImage;
  const donde = scoped(img.organizationId, orgId, eq(img.campaignId, campaignId), eq(img.id, imageId));
  const [existe] = await getDb().select({ id: img.id }).from(img).where(donde).limit(1);
  if (!existe) return { ok: false, code: "not_found", message: "Esa imagen no existe." };

  const body = CampaignBodySchema.safeParse(campana.body);
  const enUso = body.success && body.data.blocks.some((b) => b.type === "image" && b.imageId === imageId);
  if (enUso) {
    return { ok: false, code: "imagen_en_uso", message: "La imagen está en el correo: sacala del bloque primero." };
  }

  await deleteMediaFile(orgId, archivo(imageId));
  await getDb().delete(img).where(donde);
  return { ok: true };
}

/** Borra del disco los archivos de una campaña (el `cascade` solo borra filas). */
export async function borrarImagenesDeCampana(orgId: string, campaignId: string): Promise<void> {
  const img = schema.marketingImage;
  const filas = await getDb()
    .select({ id: img.id })
    .from(img)
    .where(scoped(img.organizationId, orgId, eq(img.campaignId, campaignId)));
  for (const f of filas) await deleteMediaFile(orgId, archivo(f.id));
}

/** Para la ruta pública: `null` es un 404 neutro, sea cual sea el motivo. */
export async function imagenPorToken(
  orgId: string,
  token: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!TOKEN.test(token)) return null;
  const img = schema.marketingImage;
  const [row] = await getDb()
    .select({ id: img.id })
    .from(img)
    .where(scoped(img.organizationId, orgId, eq(img.publicToken, token)))
    .limit(1);
  if (!row) return null;
  const data = await readMediaFile(orgId, archivo(row.id)).catch(() => null);
  if (!data) return null;
  const mimeType = sniffImageMime(data);
  return mimeType ? { data, mimeType } : null;
}
