import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import { countAssignedLicenses } from "@/server/licenses";

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
  return { id: s.id, name: s.name, totalLicenses: s.totalLicenses };
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
