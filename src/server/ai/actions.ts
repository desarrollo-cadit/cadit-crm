import { z } from "zod";
import { AREAS, COLLECTED_FIELDS, TOPICS, type Area, type Collected, type Topic } from "@/lib/areas";

/**
 * 029 (DV-001) — Tema de la consulta, en TODAS las variantes. Opcional: las
 * salidas de siempre (ai-mock, organizaciones con el ruteo apagado) siguen
 * validando sin él. El default (`sin_determinar`) lo pone `topicOf()`, no el
 * esquema: con `.default()` la entrada y la salida de Zod difieren y
 * `chatJson<T>` deja de poder inferir `T`.
 */
const topic = z.enum(TOPICS).optional();

/** Lo que el modelo dice haber juntado del cliente. Toda clave es opcional. */
const collectedSchema = z
  .object(
    Object.fromEntries(COLLECTED_FIELDS.map((f) => [f, z.string().max(500).optional()])) as Record<
      (typeof COLLECTED_FIELDS)[number],
      z.ZodOptional<z.ZodString>
    >
  )
  .partial();

/**
 * Acción tipada del agente: exactamente UNA por turno (FR-021).
 * El servidor valida cada acción contra sus allowlists (etapas de la org);
 * lo que no valida se degrada, nunca se ejecuta a ciegas.
 *
 * 029 — `derive_area` y `lookup` solo se OFRECEN en el prompt y solo se
 * ACEPTAN con el ruteo encendido (`normalizeAgentAction`).
 */
export const AgentAction = z.discriminatedUnion("action", [
  z.object({ action: z.literal("none"), topic }),
  z.object({ action: z.literal("reply"), text: z.string().min(1), topic }),
  z.object({
    action: z.literal("update_lead"),
    note: z.string().min(1),
    reply: z.string().optional(),
    topic,
  }),
  z.object({
    action: z.literal("move_stage"),
    stage: z.string().min(1),
    reply: z.string().optional(),
    topic,
  }),
  z.object({
    action: z.literal("handoff"),
    reason: z.string().optional(),
    farewell: z.string().optional(),
    topic,
  }),
  /**
   * 029 — Derivar a un área externa por correo. `summary` se acepta vacío a
   * propósito: un resumen vacío no es una salida "imposible" que deba
   * reintentarse y terminar en handoff, es una derivación que el servidor
   * DEGRADA (nunca se crea un caso sin resumen).
   */
  z.object({
    action: z.literal("derive_area"),
    topic,
    area: z.enum(AREAS),
    summary: z.string().max(2000),
    collected: collectedSchema.optional(),
    missing: z.array(z.string().max(40)).max(20).optional(),
    /** IGNORADO como cierre: el cierre al cliente lo arma el servidor. */
    reply: z.string().optional(),
  }),
  /**
   * 029 — Consulta de datos propios del contacto (lista cerrada).
   *
   * `.strict()` y SIN ningún campo que identifique a una persona: se consulta
   * siempre `conversation.contactId` (FR-013). No hay dónde poner una cédula.
   */
  z
    .object({
      action: z.literal("lookup"),
      topic,
      query: z.enum(["next_class", "balance", "class_material", "offline_progress"]),
      classNumber: z.number().int().min(1).max(500).optional(),
      courseHint: z.string().max(200).optional(),
    })
    .strict(),
]);

export type AgentActionType = z.infer<typeof AgentAction>;

/** 029 — Segunda llamada tras un `lookup`: SOLO redacta (DV-004). */
export const LookupReply = z.object({ text: z.string().min(1).max(1200) });
export type LookupReplyType = z.infer<typeof LookupReply>;

/** El tema de una acción, con el default del contrato. */
export function topicOf(action: AgentActionType): Topic {
  return action.topic ?? "sin_determinar";
}

/**
 * Resuelve el nombre de etapa devuelto por el modelo contra las etapas reales
 * de la organización (exacto → lower-case). Sin match: degradar a reply/none.
 */
export function resolveStage(
  requested: string,
  stages: { id: string; name: string }[]
): { id: string; name: string } | null {
  const exact = stages.find((s) => s.name === requested.trim());
  if (exact) return exact;
  const lower = requested.trim().toLowerCase();
  return stages.find((s) => s.name.toLowerCase() === lower) ?? null;
}

/** Degrada una move_stage sin etapa válida (FR-021 / contrato ai.md). */
export function degradeAction(action: AgentActionType): AgentActionType {
  if (action.action === "move_stage") {
    return action.reply
      ? { action: "reply", text: action.reply }
      : { action: "none" };
  }
  return action;
}

/* ------------------------------------------------------------------ */
/* 029 — Normalización con las reglas del servidor (contracts/agente.md) */
/* ------------------------------------------------------------------ */

type WithTopic<T> = T extends unknown ? Omit<T, "topic"> & { topic: Topic } : never;

/** Una derivación que ya pasó todas las reglas: lista para abrir o seguir un caso. */
export type DeriveAreaAction = {
  action: "derive_area";
  topic: Area;
  area: Area;
  summary: string;
  collected: Collected;
  missing: string[];
};

export type NormalizedAction =
  | WithTopic<Exclude<AgentActionType, { action: "derive_area" }>>
  | DeriveAreaAction;

/** Pregunta de aclaración cuando el tema no está claro (FR-003). */
export const CLARIFY_TEXT =
  "Para ayudarte mejor: ¿tu consulta es por la compra de licencias o cursos, o por un problema técnico con un programa?";

/** Cuando el modelo quiso derivar sin el motivo mínimo: seguir preguntando. */
const ASK_MORE_TEXT: Record<Area, string> = {
  ventas: "¡Con gusto! ¿Qué producto te interesa y para cuántas personas o licencias sería?",
  soporte: "Contame un poco más: ¿qué problema tenés y con qué programa?",
};

const SUMMARY_MAX = 200;
const emailSchema = z.string().trim().email();

/** Un resumen que no dice nada no es motivo suficiente para molestar a Ventas. */
function summaryIsUseful(summary: string): boolean {
  return summary.split(/\s+/).filter((w) => w.length > 2).length >= 3;
}

function cleanCollected(raw: Collected | undefined): Collected {
  const out: Collected = {};
  for (const field of COLLECTED_FIELDS) {
    const value = raw?.[field]?.trim();
    if (value) out[field] = value;
  }
  return out;
}

const replyOrNone = (text: string | undefined, t: Topic): NormalizedAction =>
  text && text.trim()
    ? { action: "reply", text: text.trim(), topic: t }
    : { action: "none", topic: t };

/**
 * Aplica, EN ESTE ORDEN, las reglas que el servidor impone sobre la salida del
 * modelo (la regla dura vive acá; el prompt solo orienta — DV-006):
 *
 * 1. ruteo apagado → `derive_area`/`lookup` se degradan a `reply`/`none`;
 * 2. `topic` ≠ `area` o `sin_determinar` → `reply` de aclaración;
 * 3. `summary` vacío → nunca se crea un caso sin resumen;
 * 4. sin motivo (ventas: ni producto ni resumen útil; soporte: sin problema)
 *    → `reply` para que el modelo siga preguntando;
 * 5. correo inválido → se descarta como Reply-To y pasa a `missing`.
 */
export function normalizeAgentAction(
  action: AgentActionType,
  opts: { routingEnabled: boolean }
): NormalizedAction {
  const t = topicOf(action);

  if (action.action === "lookup") {
    if (!opts.routingEnabled) return { action: "none", topic: t };
    return { ...action, topic: t };
  }

  if (action.action !== "derive_area") {
    return { ...action, topic: t } as NormalizedAction;
  }

  // 1. Ruteo apagado: como si la acción no existiera.
  if (!opts.routingEnabled) return replyOrNone(action.reply, t);

  // 2. El tema tiene que coincidir con el área.
  if (t !== action.area) {
    return { action: "reply", text: CLARIFY_TEXT, topic: "sin_determinar" };
  }

  // 3. Nunca un caso sin resumen.
  const summary = action.summary.replace(/\s+/g, " ").trim().slice(0, SUMMARY_MAX).trim();
  if (!summary) return replyOrNone(action.reply, t);

  // 4. Sin el motivo mínimo del área, se sigue preguntando.
  const collected = cleanCollected(action.collected);
  const hasMotive =
    action.area === "ventas"
      ? Boolean(collected.product) || summaryIsUseful(summary)
      : Boolean(collected.problem);
  if (!hasMotive) {
    return { action: "reply", text: action.reply?.trim() || ASK_MORE_TEXT[action.area], topic: t };
  }

  // 5. Un correo que no valida no puede ser Reply-To.
  const missing = [...new Set((action.missing ?? []).map((m) => m.trim()).filter(Boolean))];
  if (collected.email && !emailSchema.safeParse(collected.email).success) {
    delete collected.email;
    if (!missing.includes("email")) missing.push("email");
  }

  return {
    action: "derive_area",
    topic: action.area,
    area: action.area,
    summary,
    collected,
    missing,
  };
}
