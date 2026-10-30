import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { equipoPorDefecto } from "@/server/license-teams";
import { MEDIA_LIMITS, readMediaFile, saveMediaFile } from "@/server/whatsapp/media";

/**
 * 005 (DV-004, FR-001) — Alta de un software del catálogo (Revit, Civil3D...).
 *
 * 0089 — El cupo ya no es del programa sino de cada equipo de licencias
 * (`license_team_seat`, `/api/license-teams`). `totalLicenses` sigue aceptado
 * por compatibilidad (scripts y la demo lo mandan): si viene, es el cupo del
 * programa en el equipo por defecto.
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
  });
  if (input.totalLicenses && input.totalLicenses > 0) {
    await db.insert(schema.licenseTeamSeat).values({
      organizationId,
      teamId: await equipoPorDefecto(organizationId),
      softwareId: id,
      total: input.totalLicenses,
    });
  }
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
 * 005 (T031, FR-004) — edita el catálogo de software.
 *
 * 0089 — El cupo se edita por equipo (`PUT /api/license-teams/[id]/seats`),
 * que rechaza bajarlo por debajo de lo que ese equipo ya ocupa.
 */
export async function updateSoftware(
  organizationId: string,
  softwareId: string,
  input: { name?: string }
): Promise<UpdateSoftwareResult> {
  const db = getDb();

  const updated = await db
    .update(schema.software)
    .set({
      ...(input.name !== undefined ? { name: input.name } : {}),
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
