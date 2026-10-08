import { asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { withOrganizationScope } from "@/lib/db/with-tenant";
import { newId } from "@/lib/db/ids";
import { getEnv, isAiConfigured } from "@/lib/env";
import { chatJson, type ChatMessage } from "@/lib/ai";
import { publish } from "@/server/events/bus";
import { isWindowOpen } from "@/server/inbox/window";
import { SendError, sendText } from "@/server/inbox/send";
import {
  AgentAction,
  degradeAction,
  normalizeAgentAction,
  resolveStage,
  type DeriveAreaAction,
  type NormalizedAction,
} from "@/server/ai/actions";
import { shouldBackupHandoff } from "@/server/ai/handoff";
import { buildAgentSystemPrompt, type RoutingPromptInput } from "@/server/ai/prompts";
import { resolveContactProfile } from "@/server/ai/contact-profile";
import { getAreaConfigs } from "@/server/areas/config";
import {
  alreadyOpenText,
  buildClosingText,
  deliverAreaClosing,
  deriveToArea,
} from "@/server/areas/handoff";
import { organizationTimezone } from "@/server/finanzas-periodo";
import type { Topic } from "@/lib/areas";

/**
 * Turno del agente (FR-021..FR-025).
 *
 * Coalesce + lock in-process por conversación: ráfagas de mensajes → UNA
 * respuesta; nunca dos turnos simultáneos; lo que llega durante un turno
 * re-encola exactamente un turno más. Suficiente para el monolito de una
 * instancia (sin colas externas — Constitución II).
 */

type CoalesceEntry = {
  timer: ReturnType<typeof setTimeout> | null;
  running: boolean;
  pending: boolean;
};

const globalForAgent = globalThis as unknown as {
  __agentCoalesce?: Map<string, CoalesceEntry>;
};

function coalesceMap(): Map<string, CoalesceEntry> {
  if (!globalForAgent.__agentCoalesce) {
    globalForAgent.__agentCoalesce = new Map();
  }
  return globalForAgent.__agentCoalesce;
}

/**
 * Punto de entrada con debounce (mensajes entrantes reales).
 *
 * 012 (T028) — Recibe `organizationId` porque el turno corre FUERA del pedido
 * que lo disparó: el `setTimeout` del debounce lo deja para después, cuando la
 * transacción de la ingesta ya cerró. Sin un alcance propio, el agente no ve
 * la conversación que tiene que responder.
 */
export function scheduleAgentTurn(
  conversationId: string,
  organizationId: string
): void {
  const map = coalesceMap();
  const entry = map.get(conversationId) ?? {
    timer: null,
    running: false,
    pending: false,
  };
  map.set(conversationId, entry);

  if (entry.running) {
    entry.pending = true; // se re-encola al terminar el turno actual
    return;
  }
  if (entry.timer) clearTimeout(entry.timer);
  const delay = getEnv().AGENT_COALESCE_MS;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    void executeTurn(conversationId, organizationId);
  }, delay);
}

async function executeTurn(
  conversationId: string,
  organizationId: string
): Promise<void> {
  const map = coalesceMap();
  const entry = map.get(conversationId);
  if (!entry || entry.running) return;
  entry.running = true;
  try {
    // `withOrganizationScope` abre desde `getRootDb()`, así que ignora la
    // transacción heredada —y ya cerrada— del pedido que agendó este turno.
    await withOrganizationScope(organizationId, "system:agente", () =>
      runAgentTurn(conversationId)
    );
  } catch (err) {
    console.error("[agente] turno falló:", err);
  } finally {
    entry.running = false;
    if (entry.pending) {
      entry.pending = false;
      void executeTurn(conversationId, organizationId);
    } else {
      map.delete(conversationId);
    }
  }
}

/**
 * Ejecuta UN turno del agente ahora (el Laboratorio lo llama directo, con
 * debounce 0 y sin pasar por el coalesce).
 */
export async function runAgentTurn(conversationId: string): Promise<void> {
  if (!isAiConfigured()) return;

  const db = getDb();
  const convRows = await db
    .select()
    .from(schema.conversation)
    /**
     * Constitución III — la ÚNICA consulta del módulo sin `scoped()`, y no es
     * un olvido: la organización se DERIVA de esta fila, así que todavía no
     * hay alcance que declarar. Es el mismo caso que `member` y
     * `account_link`, que quedan fuera de RLS por responder "¿de quién es
     * esto?" antes de que exista un alcance.
     *
     * Igual queda protegida: el turno del agente corre dentro de la
     * transacción del webhook, que ya declaró `app.current_org`.
     */
    .where(eq(schema.conversation.id, conversationId))
    .limit(1);
  const conversation = convRows[0];
  if (!conversation) return;
  const organizationId = conversation.organizationId;

  // Condiciones de silencio: handoff activo o IA apagada en la conversación.
  if (conversation.handoffAt || !conversation.aiEnabled) return;

  const profileRows = await db
    .select()
    .from(schema.agentProfile)
    .where(scoped(schema.agentProfile.organizationId, organizationId))
    .limit(1);
  const profile = profileRows[0];
  if (!profile) return;
  // El toggle global aplica a conversaciones reales; el Laboratorio evalúa el
  // comportamiento configurado aunque el agente aún no esté encendido.
  if (!conversation.isTest && !profile.enabled) return;

  const history = await db
    .select()
    .from(schema.message)
    .where(
      scoped(
        schema.message.organizationId,
        organizationId,
        eq(schema.message.conversationId, conversationId)
      )
    )
    .orderBy(desc(schema.message.createdAt))
    .limit(20);
  history.reverse();
  const lastInbound = [...history].reverse().find((m) => m.direction === "in");
  if (!lastInbound) return;

  // Ventana cerrada: el agente JAMÁS envía texto libre → handoff 'ventana'.
  if (!conversation.isTest && !isWindowOpen(conversation.lastInboundAt)) {
    await applyHandoff(conversationId, organizationId, "ventana");
    return;
  }

  /**
   * 029 (DV-012) — Interruptor del ruteo por áreas. Apagado, todo lo que sigue
   * es el turno de siempre: mismo prompt, mismo respaldo, mismas acciones.
   */
  const routingEnabled = profile.areaRoutingEnabled;

  // Patrón de respaldo ANTES del LLM (FR-022). 029 — con el ruteo encendido,
  // pedir a alguien de Ventas/Soporte llega al modelo en vez de silenciar la IA.
  if (lastInbound.text && shouldBackupHandoff(lastInbound.text, { routingEnabled })) {
    await applyHandoff(conversationId, organizationId, "cliente");
    return;
  }

  const kb = await db
    .select()
    .from(schema.kbEntry)
    .where(scoped(schema.kbEntry.organizationId, organizationId))
    .orderBy(asc(schema.kbEntry.createdAt));
  const stages = await db
    .select({ id: schema.pipelineStage.id, name: schema.pipelineStage.name })
    .from(schema.pipelineStage)
    .where(scoped(schema.pipelineStage.organizationId, organizationId))
    .orderBy(asc(schema.pipelineStage.position));

  /**
   * 029 (DV-002) — El perfil lo calcula el SERVIDOR antes del modelo, y el
   * modelo no lo puede cambiar. Las áreas sin casilla se marcan para que el
   * prompt sepa que igual se puede derivar (el cliente recibe el cierre).
   */
  let routing: RoutingPromptInput | undefined;
  if (routingEnabled) {
    const [contactProfile, areaConfigs] = await Promise.all([
      resolveContactProfile(organizationId, conversation.contactId),
      getAreaConfigs(organizationId),
    ]);
    routing = {
      enabled: true,
      profile: contactProfile,
      areas: areaConfigs.map((a) => ({ area: a.area, enabled: a.enabled && Boolean(a.mailbox) })),
    };
  }

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: buildAgentSystemPrompt({ profile, kb, stages, routing }),
    },
    ...history
      .filter((m) => m.text)
      .map((m) => ({
        role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
        content: m.text!,
      })),
  ];

  const result = await chatJson(AgentAction, messages);
  if (!result.ok) {
    if (result.error === "not_configured") return;
    // Fallo persistente del proveedor o salida imposible → escalar (FR-022).
    console.error(`[agente] fallo del proveedor (raw): ${result.detail}`);
    await applyHandoff(conversationId, organizationId, "error");
    return;
  }

  // 029 — Reglas del servidor sobre la salida (contracts/agente.md). Con el
  // ruteo apagado solo degradan derive_area/lookup; el resto pasa intacto.
  let action: NormalizedAction = normalizeAgentAction(result.data, { routingEnabled });
  // El tema solo se persiste con el ruteo encendido (`message.ai_topic`).
  const topic: Topic | null = routingEnabled ? action.topic : null;

  if (action.action === "move_stage") {
    const stage = resolveStage(action.stage, stages);
    if (!stage) {
      action = normalizeAgentAction(degradeAction(action), { routingEnabled });
    } else {
      await moveLeadToStage(organizationId, conversation.contactId, stage.id);
      publish(organizationId, {
        type: "conversation.updated",
        data: { conversation: { id: conversationId } },
      });
      if (action.reply) {
        await deliverReply(conversation, action.reply, topic);
      }
      return;
    }
  }

  switch (action.action) {
    case "none":
      return;
    case "reply":
      await deliverReply(conversation, action.text, topic);
      return;
    case "update_lead": {
      await appendLeadNote(organizationId, conversation.contactId, action.note);
      if (action.reply) await deliverReply(conversation, action.reply, topic);
      return;
    }
    case "handoff": {
      // 029 (US2-4) — el handoff de la ACADEMIA sigue silenciando la IA.
      if (action.farewell) {
        await deliverReply(conversation, action.farewell, topic);
      }
      await applyHandoff(conversationId, organizationId, "modelo");
      return;
    }
    case "derive_area":
      await runDerivation(conversation, lastInbound.id, action);
      return;
    case "lookup":
      // 029 (MVP) — Las consultas del alumno llegan con la US3. Mientras
      // tanto, ruta segura: ningún dato, y la academia sigue disponible.
      await deliverReply(conversation, LOOKUP_UNAVAILABLE_TEXT, "academia");
      return;
  }
}

const LOOKUP_UNAVAILABLE_TEXT =
  "Por ahora no puedo consultar esos datos por acá. ¿Querés que te pase con alguien de la academia?";

/**
 * 029 (US1) — Derivación a un área externa por correo.
 *
 * El caso se persiste ANTES del cierre, y el cierre va con su propio
 * try/catch: un error de WhatsApp no revierte el caso (riesgo R4). El correo
 * sale post-commit (`deriveToArea`). NO se setea `handoffAt`: la IA sigue
 * atendiendo lo de la Academia (FR-011). El `reply` del modelo se ignora como
 * cierre: lo arma el servidor con el texto configurado del área.
 */
async function runDerivation(
  conversation: Conversation,
  sourceMessageId: string,
  action: DeriveAreaAction
): Promise<void> {
  const organizationId = conversation.organizationId;
  const result = await deriveToArea({
    organizationId,
    conversation: {
      id: conversation.id,
      contactId: conversation.contactId,
      isTest: conversation.isTest,
    },
    sourceMessageId,
    action,
  });
  const text =
    result.kind === "already_open"
      ? alreadyOpenText(result.area, result.caseRef)
      : buildClosingText(result.config, new Date(), await organizationTimezone(organizationId));

  await deliverAreaClosing(
    () => deliverReply(conversation, text, action.topic, { rethrowWindowClosed: true }),
    () => applyHandoff(conversation.id, organizationId, "ventana")
  );
}

type Conversation = typeof schema.conversation.$inferSelect;

/** Entrega la respuesta: envío real o persistencia sandbox (is_test). */
async function deliverReply(
  conversation: Conversation,
  text: string,
  aiTopic: Topic | null = null,
  opts: { rethrowWindowClosed?: boolean } = {}
): Promise<void> {
  if (conversation.isTest) {
    await persistTestOutbound(conversation, text, aiTopic);
    return;
  }
  try {
    await sendText({
      conversationId: conversation.id,
      organizationId: conversation.organizationId,
      text,
      aiGenerated: true,
      aiTopic,
    });
  } catch (err) {
    if (err instanceof SendError && err.code === "window_closed" && !opts.rethrowWindowClosed) {
      await applyHandoff(conversation.id, conversation.organizationId, "ventana");
      return;
    }
    throw err;
  }
}

/** Mensaje saliente del sandbox: se persiste, JAMÁS toca la API (FR-031). */
async function persistTestOutbound(
  conversation: Conversation,
  text: string,
  aiTopic: Topic | null = null
): Promise<void> {
  const db = getDb();
  await db.insert(schema.message).values({
    id: newId("message"),
    organizationId: conversation.organizationId,
    conversationId: conversation.id,
    direction: "out",
    type: "text",
    text,
    status: "sent",
    aiGenerated: true,
    origin: "ai",
    aiTopic,
  });
  await db
    .update(schema.conversation)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(
      scoped(
        schema.conversation.organizationId,
        conversation.organizationId,
        eq(schema.conversation.id, conversation.id)
      )
    );
}

export async function applyHandoff(
  conversationId: string,
  organizationId: string,
  reason: "cliente" | "modelo" | "error" | "ventana"
): Promise<void> {
  const db = getDb();
  const updated = await db
    .update(schema.conversation)
    .set({ handoffAt: new Date(), handoffReason: reason, updatedAt: new Date() })
    .where(
      scoped(
        schema.conversation.organizationId,
        organizationId,
        eq(schema.conversation.id, conversationId)
      )
    )
    .returning();
  if (!updated[0]) return;
  publish(organizationId, {
    type: "conversation.updated",
    data: {
      conversation: { id: conversationId, handoffReason: reason },
    },
  });
}

/**
 * 004 — Mueve el LEAD GENERAL del contacto (sin `cohort_id`): el agente de
 * IA opera desde la conversación de WhatsApp, no desde una cohorte concreta
 * (ver research.md DV-005/T010).
 */
async function moveLeadToStage(
  organizationId: string,
  contactId: string,
  stageId: string
): Promise<void> {
  const db = getDb();
  await db
    .update(schema.enrollment)
    .set({ stageId, updatedAt: new Date(), lastActivityAt: new Date() })
    .where(
      scoped(
        schema.enrollment.organizationId,
        organizationId,
        eq(schema.enrollment.contactId, contactId),
        isNull(schema.enrollment.cohortId)
      )
    );
}

async function appendLeadNote(
  organizationId: string,
  contactId: string,
  note: string
): Promise<void> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.contact.id, notes: schema.contact.notes })
    .from(schema.contact)
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contactId)))
    .limit(1);
  const contact = rows[0];
  if (!contact) return;
  const stamped = `[IA] ${note}`;
  await db
    .update(schema.contact)
    .set({
      notes: contact.notes ? `${contact.notes}\n${stamped}` : stamped,
      updatedAt: new Date(),
    })
    .where(scoped(schema.contact.organizationId, organizationId, eq(schema.contact.id, contact.id)));
}
