import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { getEnv } from "@/lib/env";
import { MEDIA_LIMITS, readMediaFile, saveMediaFile } from "@/server/whatsapp/media";

/**
 * Portada del curso subida desde el CRM, mismo patrón que la foto del
 * software (`saveSoftwarePhoto`): el archivo vive en el volumen local
 * (`MEDIA_DIR`) con un "assetId" sintético, sin tabla propia.
 *
 * La diferencia es que la consume el SITIO COMERCIAL, así que se sirve por una
 * ruta pública. En vez de agregar un campo, se escribe en `course.image_url`
 * la URL absoluta de esa ruta: el sitio sigue leyendo `imageUrl` como siempre
 * y un curso con una URL externa vieja funciona igual. El `?v=` cambia en cada
 * subida para que ningún caché sirva la imagen anterior.
 */

const assetId = (courseId: string) => `course-image-${courseId}`;

export function courseImagePublicUrl(courseId: string, version: number): string {
  const base = getEnv().APP_BASE_URL.replace(/\/+$/, "");
  return `${base}/api/public/courses/${encodeURIComponent(courseId)}/image?v=${version}`;
}

export type SaveCourseImageResult =
  | { ok: true; imageUrl: string }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

export async function saveCourseImage(
  organizationId: string,
  courseId: string,
  file: { mimeType: string; sizeBytes: number; data: Buffer }
): Promise<SaveCourseImageResult> {
  const limit = MEDIA_LIMITS.image;
  if (!limit.mimes.test(file.mimeType) || file.sizeBytes > limit.maxBytes) {
    return { ok: false, status: 422, code: "invalid_body", message: `Se espera ${limit.label}` };
  }
  const db = getDb();
  const where = scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId));
  const rows = await db.select({ id: schema.course.id }).from(schema.course).where(where).limit(1);
  if (!rows[0]) return { ok: false, status: 404, code: "not_found", message: "Curso no encontrado" };

  await saveMediaFile(organizationId, assetId(courseId), file.data);
  const imageUrl = courseImagePublicUrl(courseId, Date.now());
  await db.update(schema.course).set({ imageUrl, updatedAt: new Date() }).where(where);
  return { ok: true, imageUrl };
}

/**
 * El tipo se deduce de los primeros bytes: la subida solo acepta jpeg, png y
 * webp, así que no hace falta guardar el MIME en una columna.
 */
export function sniffImageMime(data: Buffer): string | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return "image/jpeg";
  }
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString("latin1") === "RIFF" &&
    data.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

/** null si el curso no es de la organización o no tiene imagen subida. */
export async function readCourseImage(
  organizationId: string,
  courseId: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  if (!/^[\w.-]+$/.test(courseId)) return null;
  const db = getDb();
  const rows = await db
    .select({ id: schema.course.id })
    .from(schema.course)
    .where(scoped(schema.course.organizationId, organizationId, eq(schema.course.id, courseId)))
    .limit(1);
  if (!rows[0]) return null;

  const data = await readMediaFile(organizationId, assetId(courseId)).catch(() => null);
  if (!data) return null;
  const mimeType = sniffImageMime(data);
  return mimeType ? { data, mimeType } : null;
}
