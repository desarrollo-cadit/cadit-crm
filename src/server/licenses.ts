import { asc, count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/**
 * 005 (T028, DV-004, US4) — pool de licencias por software: disponibles =
 * `software.total_licenses - count(license WHERE software_id = X AND
 * assigned = true)`.
 */
export type LicenseAvailability = {
  softwareId: string;
  softwareName: string;
  total: number;
  assignedCount: number;
  available: number;
};

/** null si el software no existe (o no pertenece a la organización). */
export async function availableLicenses(
  organizationId: string,
  softwareId: string
): Promise<LicenseAvailability | null> {
  const db = getDb();
  const softwareRows = await db
    .select({ name: schema.software.name, totalLicenses: schema.software.totalLicenses })
    .from(schema.software)
    .where(
      scoped(schema.software.organizationId, organizationId, eq(schema.software.id, softwareId))
    )
    .limit(1);
  const sw = softwareRows[0];
  if (!sw) return null;

  const assignedRows = await db
    .select({ n: count() })
    .from(schema.license)
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.softwareId, softwareId),
        eq(schema.license.assigned, true)
      )
    );
  const assignedCount = assignedRows[0]?.n ?? 0;
  return {
    softwareId,
    softwareName: sw.name,
    total: sw.totalLicenses,
    assignedCount,
    available: sw.totalLicenses - assignedCount,
  };
}

export type LicenseDto = {
  id: string;
  enrollmentId: string;
  softwareId: string;
  assigned: boolean;
  assignedAt: string | null;
};

function serializeLicense(l: typeof schema.license.$inferSelect): LicenseDto {
  return {
    id: l.id,
    enrollmentId: l.enrollmentId,
    softwareId: l.softwareId,
    assigned: l.assigned,
    assignedAt: l.assignedAt?.toISOString() ?? null,
  };
}

export type AssignLicenseResult =
  | { ok: true; license: LicenseDto }
  | { ok: false; status: 404; code: "not_found"; message: string }
  | { ok: false; status: 422; code: "invalid_body"; message: string }
  | { ok: false; status: 409; code: "no_stock"; message: string };

/**
 * 005 (T028, FR-003) — asigna una licencia de `softwareId` a la
 * inscripción; rechaza si el pool disponible es cero. Reasignar el mismo
 * software a la misma inscripción es idempotente; reasignar OTRO software
 * mueve la fila (libera el pool anterior, consume el nuevo).
 */
export async function assignLicense(
  organizationId: string,
  enrollmentId: string,
  softwareId: string
): Promise<AssignLicenseResult> {
  const db = getDb();

  const enrollmentRows = await db
    .select({ id: schema.enrollment.id })
    .from(schema.enrollment)
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.id, enrollmentId)
      )
    )
    .limit(1);
  if (!enrollmentRows[0]) {
    return { ok: false, status: 404, code: "not_found", message: "Inscripción no encontrada" };
  }

  const availability = await availableLicenses(organizationId, softwareId);
  if (!availability) {
    return { ok: false, status: 422, code: "invalid_body", message: "Software inexistente" };
  }

  const existingRows = await db
    .select()
    .from(schema.license)
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.enrollmentId, enrollmentId)
      )
    )
    .limit(1);
  const existing = existingRows[0] ?? null;
  const alreadyThisOne = Boolean(existing?.assigned && existing.softwareId === softwareId);

  if (!alreadyThisOne && availability.available <= 0) {
    return {
      ok: false,
      status: 409,
      code: "no_stock",
      message: `No hay licencias disponibles de ${availability.softwareName}`,
    };
  }
  if (alreadyThisOne) {
    return { ok: true, license: serializeLicense(existing!) };
  }

  const now = new Date();
  if (existing) {
    const updated = await db
      .update(schema.license)
      .set({ softwareId, assigned: true, assignedAt: now })
      .where(eq(schema.license.id, existing.id))
      .returning();
    return { ok: true, license: serializeLicense(updated[0]!) };
  }
  const inserted = await db
    .insert(schema.license)
    .values({
      id: newId("license"),
      organizationId,
      enrollmentId,
      softwareId,
      assigned: true,
      assignedAt: now,
    })
    .returning();
  return { ok: true, license: serializeLicense(inserted[0]!) };
}

/**
 * 005 (T028, FR-002/FR-003 escenario 3) — libera la licencia asignada de
 * una inscripción (vuelve al pool disponible). Idempotente: si no había
 * licencia asignada, no hace nada y devuelve null.
 */
export async function unassignLicense(
  organizationId: string,
  enrollmentId: string
): Promise<LicenseDto | null> {
  const db = getDb();
  const updated = await db
    .update(schema.license)
    .set({ assigned: false, assignedAt: null })
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.enrollmentId, enrollmentId),
        eq(schema.license.assigned, true)
      )
    )
    .returning();
  const row = updated[0];
  return row ? serializeLicense(row) : null;
}

/**
 * 005 iteración 2 (home, widget de licencias, pedido en vivo del dueño) —
 * total vs. disponibles por cada software de la organización. Consulta
 * propia (no reusa `listSoftware` de `@/server/software`, que a su vez
 * importa `countAssignedLicenses` de este módulo — evita el ciclo).
 */
export async function listLicenseInventory(
  organizationId: string
): Promise<LicenseAvailability[]> {
  const db = getDb();
  const softwareRows = await db
    .select({
      id: schema.software.id,
      name: schema.software.name,
      totalLicenses: schema.software.totalLicenses,
    })
    .from(schema.software)
    .where(scoped(schema.software.organizationId, organizationId))
    .orderBy(asc(schema.software.name));
  if (softwareRows.length === 0) return [];

  const assignedRows = await db
    .select({ softwareId: schema.license.softwareId, n: count() })
    .from(schema.license)
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.assigned, true)
      )
    )
    .groupBy(schema.license.softwareId);
  const assignedMap = new Map(assignedRows.map((r) => [r.softwareId, r.n]));

  return softwareRows.map((s) => {
    const assignedCount = assignedMap.get(s.id) ?? 0;
    return {
      softwareId: s.id,
      softwareName: s.name,
      total: s.totalLicenses,
      assignedCount,
      available: s.totalLicenses - assignedCount,
    };
  });
}

/** 005 (T031, FR-004) — cuántas licencias de este software están asignadas. */
export async function countAssignedLicenses(
  organizationId: string,
  softwareId: string
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ n: count() })
    .from(schema.license)
    .where(
      scoped(
        schema.license.organizationId,
        organizationId,
        eq(schema.license.softwareId, softwareId),
        eq(schema.license.assigned, true)
      )
    );
  return rows[0]?.n ?? 0;
}
