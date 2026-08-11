import { eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { apiError, parseBody } from "@/lib/api";
import { scoped } from "@/lib/db/tenant";
import { requireBotKey, resolveInstanceOrg } from "@/server/bot/auth";
import { publish } from "@/server/events/bus";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  conversationId: z.string().min(1),
});

/**
 * Reinicio de UNA conversación para la línea de pruebas del operador: IA
 * reactivada (sale del handoff) y lead de vuelta a la primera etapa. El
 * historial del inbox NO se borra: es auditoría. Lo invoca el cerebro externo
 * cuando un número de su allowlist manda `/reset`.
 */
export async function POST(req: Request) {
  const denied = requireBotKey(req);
  if (denied) return denied;

  const organizationId = await resolveInstanceOrg();
  if (!organizationId) {
    return apiError(409, "no_org", "La instancia aún no tiene organización");
  }

  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const db = getDb();
  const rows = await db
    .select({
      id: schema.conversation.id,
      contactId: schema.conversation.contactId,
    })
    .from(schema.conversation)
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, body.data.conversationId)
      )
    )
    .limit(1);
  const conv = rows[0];
  if (!conv) return apiError(404, "not_found", "Conversación no encontrada");

  await db
    .update(schema.conversation)
    .set({
      aiEnabled: true,
      handoffAt: null,
      handoffReason: null,
      updatedAt: new Date(),
    })
    .where(scoped(schema.conversation.organizationId, organizationId, eq(schema.conversation.id, conv.id)));

  // Etapa al inicio del funnel (best-effort: sin etapas no revienta el reset).
  try {
    const stages = await db
      .select()
      .from(schema.pipelineStage)
      .where(scoped(schema.pipelineStage.organizationId, organizationId));
    const first = [...stages].sort((a, b) => a.position - b.position)[0];
    const leadRows = await db
      .select({ id: schema.enrollment.id })
      .from(schema.enrollment)
      .where(
        scoped(
          schema.enrollment.organizationId,
          organizationId,
          eq(schema.enrollment.contactId, conv.contactId),
          isNull(schema.enrollment.cohortId)
        )
      )
      .limit(1);
    if (first && leadRows[0]) {
      await db
        .update(schema.enrollment)
        .set({ stageId: first.id, updatedAt: new Date() })
        .where(scoped(schema.enrollment.organizationId, organizationId, eq(schema.enrollment.id, leadRows[0].id)));
    }
  } catch (err) {
    console.warn(`[bot/reset] reinicio de etapa falló: ${err}`);
  }

  publish(organizationId, {
    type: "conversation.updated",
    data: { conversation: { id: conv.id } },
  });
  return Response.json({ ok: true });
}
