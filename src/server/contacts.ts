import { eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

export function serializeContact(c: typeof schema.contact.$inferSelect) {
  return {
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    phone: c.phone,
    notes: c.notes,
    source: c.source,
    utmCampaign: c.utmCampaign,
    email: c.email,
    nationalId: c.nationalId,
    archivedAt: c.archivedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function getContactById(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        eq(schema.contact.id, contactId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Etapa actual del LEAD GENERAL del contacto (si existe) — 004: el panel de
 * contacto opera desde la conversación de WhatsApp, no desde una camada
 * concreta, así que resuelve el `enrollment` sin `cohort_id` (ver
 * research.md DV-005/T010).
 */
export async function getContactStage(
  organizationId: string,
  contactId: string
) {
  const db = getDb();
  const rows = await db
    .select({ stage: schema.pipelineStage, lead: schema.enrollment })
    .from(schema.enrollment)
    .innerJoin(
      schema.pipelineStage,
      eq(schema.enrollment.stageId, schema.pipelineStage.id)
    )
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId),
        isNull(schema.enrollment.cohortId)
      )
    )
    .limit(1);
  return rows[0] ?? null;
}
