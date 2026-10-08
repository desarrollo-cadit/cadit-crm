import { asc, desc, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { AreaHandoffDto } from "@/lib/areas";

/**
 * 029 — Las derivaciones de una conversación, para el panel del inbox.
 *
 * Sin el HTML del correo (no se persiste) y sin nada del Laboratorio: el
 * inbox solo lista conversaciones reales.
 */
export async function listAreaHandoffs(
  organizationId: string,
  conversationId: string
): Promise<AreaHandoffDto[]> {
  const db = getDb();
  const handoffs = await db
    .select()
    .from(schema.areaHandoff)
    .where(
      scoped(
        schema.areaHandoff.organizationId,
        organizationId,
        eq(schema.areaHandoff.conversationId, conversationId)
      )
    )
    .orderBy(desc(schema.areaHandoff.createdAt));
  if (handoffs.length === 0) return [];

  const emails = await db
    .select()
    .from(schema.areaHandoffEmail)
    .where(
      scoped(
        schema.areaHandoffEmail.organizationId,
        organizationId,
        inArray(
          schema.areaHandoffEmail.handoffId,
          handoffs.map((h) => h.id)
        )
      )
    )
    .orderBy(asc(schema.areaHandoffEmail.createdAt));

  return handoffs.map((h) => ({
    id: h.id,
    caseRef: h.caseRef,
    area: h.area,
    summary: h.summary,
    status: h.status,
    missing: h.missing,
    createdAt: h.createdAt.toISOString(),
    lastActivityAt: h.lastActivityAt.toISOString(),
    emails: emails
      .filter((e) => e.handoffId === h.id)
      .map((e) => ({
        kind: e.kind,
        status: e.status,
        error: e.error,
        to: e.recipients.to,
        cc: e.recipients.cc,
        replyTo: e.recipients.replyTo,
        sentAt: e.sentAt?.toISOString() ?? null,
        createdAt: e.createdAt.toISOString(),
      })),
  }));
}
