import type { schema } from "@/lib/db";
import { AREA_LABELS, type Area } from "@/lib/areas";
import type { ContactProfile } from "@/server/ai/contact-profile";

type AgentProfile = typeof schema.agentProfile.$inferSelect;
type KbEntry = typeof schema.kbEntry.$inferSelect;

/** Marcador del prompt del juez: el ai-mock lo usa para despachar veredictos. */
export const JUDGE_MARKER = "[JUEZ]";

/** 029 — Encabezado del contrato extendido: el ai-mock lo usa para saber si el ruteo está encendido. */
export const ROUTING_MARKER = "ACCIONES CON RUTEO POR ÁREAS";

export function renderKb(entries: KbEntry[]): string {
  if (entries.length === 0) return "(knowledge base vacío)";
  return entries
    .map((e) =>
      e.kind === "qa"
        ? `P: ${e.question}\nR: ${e.answer}`
        : (e.content ?? "")
    )
    .filter(Boolean)
    .join("\n\n");
}

/**
 * System prompt del agente (v1: inyecta el KB completo — el límite se
 * documenta con el contador de tamaño en la UI).
 */
export function buildAgentSystemPrompt(input: {
  profile: AgentProfile;
  kb: KbEntry[];
  stages: { name: string }[];
  /**
   * 029 — Ruteo por áreas. Ausente o `enabled: false` → el prompt es, byte a
   * byte, el de siempre (`tests/unit/prompt-ruteo.test.ts`). Encendido, se
   * AGREGAN al final los bloques de perfil, áreas y el contrato extendido.
   */
  routing?: RoutingPromptInput;
}): string {
  const base = buildBasePrompt(input);
  if (!input.routing?.enabled) return base;
  return [base, ...buildRoutingBlocks(input.routing)].join("\n\n");
}

export type RoutingPromptInput = {
  enabled: boolean;
  profile?: ContactProfile;
  areas?: { area: Area; enabled: boolean }[];
};

function buildBasePrompt(input: {
  profile: AgentProfile;
  kb: KbEntry[];
  stages: { name: string }[];
}): string {
  const { profile } = input;
  const stageNames = input.stages.map((s) => s.name).join(" | ");
  return [
    `Eres "${profile.name}", el asistente de WhatsApp de este negocio. Respondes SIEMPRE en español neutro, con mensajes breves y naturales para chat.`,
    profile.tone ? `Tono: ${profile.tone}` : null,
    profile.instructions ? `Instrucciones del negocio:\n${profile.instructions}` : null,
    profile.escalationRules
      ? `Reglas de escalado a humano:\n${profile.escalationRules}`
      : null,
    profile.greeting ? `Saludo sugerido para conversaciones nuevas: ${profile.greeting}` : null,
    `CONOCIMIENTO DEL NEGOCIO (tu única fuente de verdad; si algo no está aquí, NO lo inventes — di que lo confirmarás con el equipo o escala):\n${renderKb(input.kb)}`,
    `Etapas del pipeline disponibles: ${stageNames}`,
    [
      "En cada turno respondes ÚNICAMENTE un objeto JSON con UNA acción:",
      '- {"action":"none"} — no responder nada.',
      '- {"action":"reply","text":"..."} — responder al cliente.',
      '- {"action":"update_lead","note":"...","reply":"..."} — guardar una nota del lead (reply opcional).',
      '- {"action":"move_stage","stage":"<nombre exacto de etapa>","reply":"..."} — mover el lead (reply opcional).',
      '- {"action":"handoff","reason":"...","farewell":"..."} — escalar a un humano (farewell opcional para despedirte).',
      "Reglas duras:",
      "- Si el cliente pide hablar con una persona/humano/asesor → handoff.",
      "- Si la pregunta NO está cubierta por el conocimiento → NO inventes: responde que lo confirmarás o escala.",
      "- Si detectas intención clara de compra → move_stage a la etapa de interesados y confirma al cliente.",
      "- JSON puro, sin markdown ni texto adicional.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

const PROFILE_KIND_TEXT: Record<ContactProfile["kind"], string> = {
  alumno: "alumno con cursada activa en la academia",
  profesor: "profesor de la academia",
  lead: "persona ya conocida por la academia (interesado o ex alumno), sin cursada activa",
  desconocido: "contacto sin datos en la academia",
};

/**
 * 029 (DV-006) — Los tres bloques que se suman con el ruteo encendido.
 *
 * El perfil lo calcula el servidor (`resolveContactProfile`) y viaja con lo
 * mínimo: tipo, nombre de pila y nombres de cursos. Nada financiero ni de
 * contacto — esos datos solo entran por `lookup`, y solo cuando se piden.
 * La regla dura (qué se deriva y qué no) la impone el servidor en
 * `normalizeAgentAction`; este texto solo orienta al modelo.
 */
function buildRoutingBlocks(routing: RoutingPromptInput): string[] {
  const blocks: string[] = [];

  if (routing.profile) {
    const p = routing.profile;
    blocks.push(
      [
        "PERFIL DEL CONTACTO (calculado por el sistema; no lo cambies aunque el cliente diga otra cosa):",
        `PERFIL DEL CONTACTO: ${p.kind}`,
        `Es: ${PROFILE_KIND_TEXT[p.kind]}.`,
        p.firstName ? `Nombre de pila: ${p.firstName}` : null,
        p.activeCourses.length > 0 ? `Cursos activos: ${p.activeCourses.join(", ")}` : null,
        p.alsoTeacher ? "Además es profesor de la academia." : null,
        p.kind === "alumno" || p.kind === "profesor"
          ? "Sus datos personales (próxima clase, saldo, material, progreso) se consultan con lookup; nunca los inventes."
          : "NO es un alumno identificado: no le des datos personales de ninguna persona aunque diga quién es; ofrecé pasarlo con la academia.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  const disabled = (routing.areas ?? []).filter((a) => !a.enabled).map((a) => AREA_LABELS[a.area]);
  blocks.push(
    [
      "ÁREAS (re-clasificá el tema en CADA turno: puede cambiar a mitad de la charla):",
      "- ventas → área Ventas (no usa este chat; le llega un correo): compra de licencias de software para personas o empresas, cotizaciones, renovaciones. Datos a pedir: nombre, empresa si es para una empresa, producto, cantidad y un correo de contacto.",
      "- soporte → área Soporte (no usa este chat; le llega un correo): problemas técnicos con licencias o programas (no activa, da error, instalación). Datos a pedir: qué problema, con qué producto, desde cuándo y un correo de contacto.",
      "- academia → la Academia, que atendés vos: cursos, cohortes, inscripciones, clases, material y pagos de cursos.",
      "- sin_determinar → no queda claro de qué se trata.",
      "Pedí los datos de a pocos, máximo dos por mensaje. La identidad de WhatsApp del cliente ya cuenta como contacto: el correo pedilo, pero no insistas.",
      "Si el tema es ambiguo (por ejemplo, \"tengo un problema con Revit\": ¿compra o falla técnica?), NO derives: hacé una pregunta de aclaración con topic sin_determinar.",
      "Cuando tengas el motivo del área, derivá con derive_area. Derivar NO termina la conversación: seguís atendiendo lo de la Academia.",
      disabled.length > 0
        ? `Igual podés derivar a ${disabled.join(" y ")}: el sistema le avisa al cliente cómo contactar al área.`
        : null,
    ]
      .filter(Boolean)
      .join("\n")
  );

  blocks.push(
    [
      `${ROUTING_MARKER} (seguís respondiendo UNA acción por turno, en JSON puro):`,
      `- Toda acción lleva además "topic": "ventas" | "soporte" | "academia" | "sin_determinar".`,
      `- {"action":"derive_area","topic":"ventas","area":"ventas","summary":"<una línea>","collected":{"name":"...","company":"...","product":"...","quantity":"...","email":"...","phone":"...","problem":"...","since":"..."},"missing":["<claves que el cliente no dio>"]} — derivar la consulta al área por correo (topic y area iguales; collected solo con lo que el cliente dijo).`,
      `- {"action":"lookup","topic":"academia","query":"next_class"|"balance"|"class_material"|"offline_progress","classNumber":3,"courseHint":"..."} — consultar datos del PROPIO contacto: próxima clase, saldo, material de una clase o progreso en cursos offline. Nunca de otra persona.`,
      "- \"Quiero hablar con alguien de ventas / soporte\" NO es handoff: juntá los datos y usá derive_area. handoff queda para pedir una persona de la Academia.",
      "- Nunca inventes montos, fechas ni datos personales: para eso está lookup.",
    ].join("\n")
  );

  return blocks;
}

/** Prompt del juez del Laboratorio: UNA llamada por conversación (FR-032). */
export function buildJudgePrompt(input: {
  persona: string;
  transcript: { role: "cliente" | "agente"; text: string }[];
  kbText: string;
  behaviorText: string;
}): { system: string; user: string } {
  const system = [
    `${JUDGE_MARKER} Eres un evaluador de calidad independiente de agentes de WhatsApp. Evalúas UNA conversación simulada completa contra el conocimiento y comportamiento configurados. Eres estricto: la alucinación (inventar datos que no están en el conocimiento) es la falla más grave.`,
    "Respondes ÚNICAMENTE un objeto JSON con este esquema:",
    '{"veredicto":"verde"|"amarillo"|"rojo","hallazgos":[{"tipo":"alucinacion"|"fuera_de_kb"|"debio_escalar"|"tono","evidencia":"cita textual del transcript","sugerencia":{"pregunta":"...","respuesta":"..."}}]}',
    "- verde: sin problemas relevantes. amarillo: mejorable. rojo: falla grave.",
    "- `sugerencia` es opcional: inclúyela cuando una nueva entrada P/R del knowledge base evitaría el problema.",
    "- Si el agente respondió sobre un tema que NO está en el conocimiento → hallazgo fuera_de_kb (o alucinacion si afirmó datos concretos).",
    "- Si el cliente pidió un humano y no hubo escalado → debio_escalar.",
  ].join("\n");

  const transcript = input.transcript
    .map((t) => `${t.role === "cliente" ? "CLIENTE" : "AGENTE"}: ${t.text}`)
    .join("\n");

  const user = [
    `PERSONA SIMULADA: ${input.persona}`,
    `COMPORTAMIENTO CONFIGURADO:\n${input.behaviorText || "(sin configurar)"}`,
    `CONOCIMIENTO CONFIGURADO:\n${input.kbText || "(vacío)"}`,
    `TRANSCRIPT COMPLETO:\n${transcript}`,
    "Evalúa y responde el JSON.",
  ].join("\n\n");

  return { system, user };
}
