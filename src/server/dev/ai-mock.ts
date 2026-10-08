import { JUDGE_MARKER, ROUTING_MARKER } from "@/server/ai/prompts";

/**
 * Proveedor LLM determinista para el self-test (contrato mocks.md).
 * Despacha por contenido del último mensaje `user` (o del system si es el
 * juez). JAMÁS es fallback en runtime: solo responde si OPENROUTER_BASE_URL
 * apunta explícitamente a él y el gate de mocks está activo.
 */

type InMessage = { role: string; content: string };

export function aiMockCompletion(messages: InMessage[]): string {
  const system = messages.find((m) => m.role === "system")?.content ?? "";
  const lastUser =
    [...messages].reverse().find((m) => m.role === "user")?.content ?? "";

  // Juez del Laboratorio: veredicto determinista por persona. Para cerrar el
  // loop del self-test, la persona fuera_de_kb pasa a verde si el CONOCIMIENTO
  // configurado ya cubre garantías/devoluciones (sugerencia aplicada).
  if (system.includes(JUDGE_MARKER)) {
    const kbSection =
      lastUser
        .split("CONOCIMIENTO CONFIGURADO:")[1]
        ?.split("TRANSCRIPT COMPLETO:")[0] ?? "";
    const kbCoversWarranty = /garant|devoluc/i.test(kbSection);
    if (lastUser.includes("fuera_de_kb") && !kbCoversWarranty) {
      return JSON.stringify({
        veredicto: "rojo",
        hallazgos: [
          {
            tipo: "fuera_de_kb",
            evidencia:
              "El cliente preguntó por garantías y devoluciones y el conocimiento no lo cubre.",
            sugerencia: {
              pregunta: "¿Cuál es la política de garantías y devoluciones?",
              respuesta:
                "Aceptamos devoluciones dentro de los 30 días con ticket de compra; la garantía depende del fabricante.",
            },
          },
        ],
      });
    }
    return JSON.stringify({ veredicto: "verde", hallazgos: [] });
  }

  const text = lastUser.toLowerCase();

  // 029 — Con el ruteo por áreas encendido (el prompt trae el contrato
  // extendido), las ramas de derivación van ANTES de "quiero comprar".
  if (system.includes(ROUTING_MARKER)) {
    const routed = routingCompletion(messages, lastUser);
    if (routed) return routed;
  }

  // Persona pide_humano (el regex de respaldo captura la frase canónica; esta
  // rama cubre variantes que llegan al modelo).
  if (text.includes("humano") || text.includes("asesor")) {
    return JSON.stringify({ action: "handoff", reason: "cliente" });
  }

  // Intención de compra → mover a Interesado.
  if (
    text.includes("lo compro") ||
    text.includes("quiero comprar") ||
    text.includes("me lo llevo")
  ) {
    return JSON.stringify({
      action: "move_stage",
      stage: "Interesado",
      reply: "¡Excelente! Te aparto el producto y un compañero te confirma el pago.",
    });
  }

  const eco = lastUser.slice(0, 80);
  return JSON.stringify({
    action: "reply",
    text: `Respuesta de prueba sobre: ${eco}`,
  });
}

/* ------------------------------------------------------------------ */
/* 029 — Ruteo por áreas (research DV-010)                             */
/* ------------------------------------------------------------------ */

const PRODUCTS = ["AutoCAD", "Revit", "Civil 3D", "3ds Max", "Navisworks", "SketchUp"];

function findProduct(text: string): string | undefined {
  return PRODUCTS.find((p) => text.toLowerCase().includes(p.toLowerCase()));
}

/** Lo que el cliente fue diciendo, juntado de TODOS sus mensajes (el último manda). */
function collectSales(userTexts: string[]) {
  const all = userTexts.join("\n");
  const collected: Record<string, string> = {};
  const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(all)?.[0];
  if (email) collected.email = email;
  const product = [...userTexts].reverse().map(findProduct).find(Boolean);
  if (product) collected.product = product;
  const quantities = [...all.matchAll(/(\d+)\s+licencias?/gi)];
  const quantity = quantities[quantities.length - 1]?.[1];
  if (quantity) collected.quantity = quantity;
  for (const t of userTexts) {
    const soy = /\bsoy\s+(.+?)\s+de\s+(.+?)(?:,|\.|$)/i.exec(t);
    if (soy?.[1] && soy[2]) {
      collected.name = soy[1].trim();
      collected.company = soy[2].trim();
    }
  }
  return collected;
}

/**
 * Despacho del ruteo por el último mensaje y el historial del CLIENTE. Solo
 * corre si el system prompt trae el contrato de ruteo; devuelve `null` para
 * seguir con las ramas de siempre.
 */
function routingCompletion(messages: InMessage[], lastUser: string): string | null {
  const text = lastUser.toLowerCase();
  const userTexts = messages.filter((m) => m.role === "user").map((m) => m.content);
  const history = userTexts.join("\n").toLowerCase();

  // Pedir a alguien de la ACADEMIA: el handoff de siempre (el respaldo del
  // servidor ya lo atrapa; esta rama cubre las variantes que llegan al modelo).
  if (/academia/.test(text) && /(hablar|comunicar|contactar|alguien|persona)/.test(text)) {
    return JSON.stringify({ action: "handoff", reason: "cliente", topic: "academia" });
  }

  // Soporte: una falla concreta.
  if (/no me activa|no activa|me da error|no abre/.test(text)) {
    const product = findProduct(lastUser) ?? "el programa";
    return JSON.stringify({
      action: "derive_area",
      topic: "soporte",
      area: "soporte",
      summary: `No activa la licencia de ${product}`,
      collected: {
        problem: lastUser.trim(),
        product,
        ...(/ayer/.test(text) ? { since: "ayer" } : {}),
      },
      missing: ["email"],
    });
  }

  // Ambiguo: "tengo un problema con Revit" puede ser compra o falla técnica.
  if (/problema con/.test(text)) {
    return JSON.stringify({
      action: "reply",
      topic: "sin_determinar",
      text: "¿Tu consulta es por la compra de una licencia o por un problema técnico con el programa?",
    });
  }

  // Una pregunta de la academia en medio de una charla de ventas: la atiende el agente.
  if (/curso|clase|cohorte|inscrib/.test(text) && !/licencia/.test(text)) {
    return JSON.stringify({
      action: "reply",
      topic: "academia",
      text: `Respuesta de prueba sobre: ${lastUser.slice(0, 80)}`,
    });
  }

  // Ventas: licencias (o pedir a alguien de ventas), en este mensaje o antes.
  if (/licencia|ventas|comercial/.test(text) || /licencia/.test(history)) {
    const collected = collectSales(userTexts);
    if (!collected.email) {
      return JSON.stringify({
        action: "reply",
        topic: "ventas",
        text: "¡Genial! Para pasarle tu consulta al equipo comercial, ¿me decís tu nombre, la empresa y un correo de contacto?",
      });
    }
    const summary = collected.quantity
      ? `${collected.quantity} licencias de ${collected.product ?? "software"}`
      : `Licencias de ${collected.product ?? "software"}`;
    return JSON.stringify({
      action: "derive_area",
      topic: "ventas",
      area: "ventas",
      summary,
      collected,
      missing: ["name", "company", "product", "quantity"].filter((k) => !collected[k]),
      reply: "Te paso con Ventas.",
    });
  }

  return null;
}
