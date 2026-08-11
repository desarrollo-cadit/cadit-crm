import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { countAssignedLicenses } from "@/server/licenses";
import { MEDIA_LIMITS, readMediaFile, saveMediaFile } from "@/server/whatsapp/media";

/**
 * 005 (DV-004, FR-001) — Alta de un software del catálogo (Revit, Civil3D...).
 * Solo el catálogo básico en esta fase; la lógica de disponibilidad/stock
 * (PATCH de totalLicenses con validación) es US4, fuera de este alcance.
 */
export async function createSoftware(
  organizationId: string,
  input: { name: string; totalLicenses?: number }
) {
  const db = getDb();
  const id = newId("software");
  await db.insert(schema.software).values({
    id,
    organizationId,
    name: input.name,
    totalLicenses: input.totalLicenses ?? 0,
  });
  return id;
}

/** 005 — Listado del catálogo de software de la organización, por nombre. */
export async function listSoftware(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId))
    .orderBy(asc(schema.software.name));
}

export function serializeSoftware(s: typeof schema.software.$inferSelect) {
  return {
    id: s.id,
    name: s.name,
    totalLicenses: s.totalLicenses,
    hasPhoto: s.photoMimeType !== null,
  };
}

export type SavePhotoResult =
  | { ok: true }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * 005 iteración 5 (feedback en vivo: "adjuntar foto de los productos de
 * licencia... así es más fácil distinguir") — foto en disco local, mismo
 * patrón que los adjuntos de WhatsApp (`saveMediaFile`/`readMediaFile`,
 * `src/server/whatsapp/media.ts`) reusado tal cual: NO se crea un
 * `mediaAsset` (esa tabla es específica de WhatsApp/Graph, no le sirve a un
 * logo de producto) — solo se reusa el helper de disco con un "assetId"
 * sintético propio (`sw-photo-<id>`).
 */
export async function saveSoftwarePhoto(
  organizationId: string,
  softwareId: string,
  file: { mimeType: string; sizeBytes: number; data: Buffer }
): Promise<SavePhotoResult> {
  if (!MEDIA_LIMITS.image.mimes.test(file.mimeType) || file.sizeBytes > MEDIA_LIMITS.image.maxBytes) {
    return { ok: false, status: 422, code: "invalid_body", message: `Se espera ${MEDIA_LIMITS.image.label}` };
  }
  const db = getDb();
  const rows = await db
    .select({ id: schema.software.id })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId)))
    .limit(1);
  if (!rows[0]) return { ok: false, status: 404, code: "not_found", message: "Software no encontrado" };

  await saveMediaFile(organizationId, `sw-photo-${softwareId}`, file.data);
  await db
    .update(schema.software)
    .set({ photoMimeType: file.mimeType, updatedAt: new Date() })
    .where(scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId)));
  return { ok: true };
}

export async function getSoftwarePhoto(
  organizationId: string,
  softwareId: string
): Promise<{ data: Buffer; mimeType: string } | null> {
  const db = getDb();
  const rows = await db
    .select({ photoMimeType: schema.software.photoMimeType })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId)))
    .limit(1);
  const mimeType = rows[0]?.photoMimeType;
  if (!mimeType) return null;
  const data = await readMediaFile(organizationId, `sw-photo-${softwareId}`);
  return { data, mimeType };
}

export type UpdateSoftwareResult =
  | { ok: true; software: ReturnType<typeof serializeSoftware> }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string };

/**
 * 005 (T031, FR-004) — edita el catálogo de software; rechaza bajar
 * `totalLicenses` por debajo de las licencias `assigned` actuales.
 */
export async function updateSoftware(
  organizationId: string,
  softwareId: string,
  input: { name?: string; totalLicenses?: number }
): Promise<UpdateSoftwareResult> {
  const db = getDb();

  if (input.totalLicenses !== undefined) {
    const assignedCount = await countAssignedLicenses(organizationId, softwareId);
    if (input.totalLicenses < assignedCount) {
      return {
        ok: false,
        status: 422,
        code: "invalid_body",
        message: `No se puede bajar de ${assignedCount} licencias: ya hay ${assignedCount} asignadas`,
      };
    }
  }

  const updated = await db
    .update(schema.software)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.totalLicenses !== undefined ? { totalLicenses: input.totalLicenses } : {}),
      updatedAt: new Date(),
    })
    .where(
      scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId))
    )
    .returning();
  const row = updated[0];
  if (!row) return { ok: false, status: 404, code: "not_found", message: "Software no encontrado" };
  return { ok: true, software: serializeSoftware(row) };
}
