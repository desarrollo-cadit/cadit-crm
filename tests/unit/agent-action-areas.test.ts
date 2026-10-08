import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  AgentAction,
  LookupReply,
  normalizeAgentAction,
  topicOf,
} from "@/server/ai/actions";

/**
 * 029 — Contrato JSON del agente (`contracts/agente.md`).
 *
 * Lo que fija este archivo: las salidas de hoy siguen validando (el ai-mock y
 * toda organización con el ruteo apagado), las dos acciones nuevas tienen su
 * forma, `lookup` no tiene dónde poner a OTRA persona, y las reglas del
 * servidor se aplican en el orden del contrato.
 */

describe("topic: opcional y con default", () => {
  it.each([
    { action: "none" },
    { action: "reply", text: "hola" },
    { action: "update_lead", note: "n" },
    { action: "move_stage", stage: "Interesado" },
    { action: "handoff", reason: "cliente" },
  ])("la variante %o sigue validando sin topic", (raw) => {
    const parsed = AgentAction.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(topicOf(parsed.data)).toBe("sin_determinar");
  });

  it("acepta topic en cualquier variante", () => {
    const parsed = AgentAction.parse({ action: "reply", text: "x", topic: "academia" });
    expect(topicOf(parsed)).toBe("academia");
  });

  it("rechaza un topic fuera de la lista", () => {
    expect(AgentAction.safeParse({ action: "none", topic: "marketing" }).success).toBe(false);
  });
});

describe("derive_area y lookup", () => {
  it("derive_area parsea con su forma", () => {
    const parsed = AgentAction.parse({
      action: "derive_area",
      topic: "ventas",
      area: "ventas",
      summary: "5 licencias de AutoCAD",
      collected: { name: "Laura", company: "Sur", product: "AutoCAD", quantity: "5" },
      missing: ["email"],
    });
    expect(parsed.action).toBe("derive_area");
  });

  it("lookup parsea con su forma", () => {
    const parsed = AgentAction.parse({
      action: "lookup",
      topic: "academia",
      query: "class_material",
      classNumber: 3,
      courseHint: "Revit",
    });
    expect(parsed.action).toBe("lookup");
  });

  it.each(["cedula", "contactId", "email"])(
    "lookup es estricto: rechaza `%s` (no hay dónde poner a otra persona)",
    (campo) => {
      const parsed = AgentAction.safeParse({
        action: "lookup",
        query: "balance",
        [campo]: "12345678",
      });
      expect(parsed.success).toBe(false);
    }
  );

  it.each([0, 501, 2.5])("classNumber %s fuera de 1..500 entero → inválido", (n) => {
    expect(
      AgentAction.safeParse({ action: "lookup", query: "class_material", classNumber: n })
        .success
    ).toBe(false);
  });

  it("un query fuera del enum es inválido", () => {
    expect(AgentAction.safeParse({ action: "lookup", query: "grades" }).success).toBe(false);
  });
});

describe("LookupReply", () => {
  it("acepta text de 1..1200", () => {
    expect(LookupReply.safeParse({ text: "ok" }).success).toBe(true);
    expect(LookupReply.safeParse({ text: "" }).success).toBe(false);
    expect(LookupReply.safeParse({ text: "x".repeat(1201) }).success).toBe(false);
  });
});

const derive = (over: Record<string, unknown> = {}) =>
  AgentAction.parse({
    action: "derive_area",
    topic: "ventas",
    area: "ventas",
    summary: "5 licencias de AutoCAD",
    collected: { product: "AutoCAD", email: "laura@sur.test" },
    missing: [],
    reply: "Te paso con Ventas",
    ...over,
  });

describe("normalizeAgentAction — reglas del servidor, en orden", () => {
  it("ruteo apagado: derive_area → reply con su texto", () => {
    expect(normalizeAgentAction(derive(), { routingEnabled: false })).toMatchObject({
      action: "reply",
      text: "Te paso con Ventas",
    });
  });

  it("ruteo apagado: derive_area sin reply → none", () => {
    expect(
      normalizeAgentAction(derive({ reply: undefined }), { routingEnabled: false })
    ).toMatchObject({ action: "none" });
  });

  it("ruteo apagado: lookup → none", () => {
    const lookup = AgentAction.parse({ action: "lookup", query: "balance" });
    expect(normalizeAgentAction(lookup, { routingEnabled: false })).toMatchObject({
      action: "none",
    });
  });

  it("ruteo apagado: las variantes de siempre pasan intactas", () => {
    const r = AgentAction.parse({ action: "reply", text: "hola" });
    expect(normalizeAgentAction(r, { routingEnabled: false })).toEqual({
      action: "reply",
      text: "hola",
      topic: "sin_determinar",
    });
  });

  it("topic distinto del área → reply de aclaración", () => {
    const n = normalizeAgentAction(derive({ topic: "soporte" }), { routingEnabled: true });
    expect(n.action).toBe("reply");
    expect(n.topic).toBe("sin_determinar");
  });

  it("topic sin_determinar → reply de aclaración (FR-003)", () => {
    const n = normalizeAgentAction(derive({ topic: "sin_determinar" }), { routingEnabled: true });
    expect(n.action).toBe("reply");
    if (n.action === "reply") expect(n.text).toMatch(/\?/);
  });

  it("summary vacío tras trim → nunca se deriva", () => {
    const n = normalizeAgentAction(derive({ summary: "   " }), { routingEnabled: true });
    expect(n.action).not.toBe("derive_area");
  });

  it("ventas sin producto ni resumen útil → reply (el modelo sigue preguntando)", () => {
    const n = normalizeAgentAction(
      derive({ summary: "consulta", collected: {} }),
      { routingEnabled: true }
    );
    expect(n.action).toBe("reply");
  });

  it("soporte sin problema → reply", () => {
    const n = normalizeAgentAction(
      derive({ topic: "soporte", area: "soporte", collected: { product: "Revit" } }),
      { routingEnabled: true }
    );
    expect(n.action).toBe("reply");
  });

  it("soporte con problema → derive_area", () => {
    const n = normalizeAgentAction(
      derive({
        topic: "soporte",
        area: "soporte",
        summary: "No activa la licencia",
        collected: { problem: "no activa la licencia", product: "Revit" },
      }),
      { routingEnabled: true }
    );
    expect(n.action).toBe("derive_area");
  });

  it("correo inválido: se quita y se agrega `email` a missing", () => {
    const n = normalizeAgentAction(
      derive({ collected: { product: "AutoCAD", email: "laura-arroba-sur" } }),
      { routingEnabled: true }
    );
    expect(n.action).toBe("derive_area");
    if (n.action === "derive_area") {
      expect(n.collected.email).toBeUndefined();
      expect(n.missing).toContain("email");
    }
  });

  it("derivación válida pasa con summary recortado y topic", () => {
    const n = normalizeAgentAction(
      derive({ summary: `  ${"a".repeat(250)}  ` }),
      { routingEnabled: true }
    );
    expect(n.action).toBe("derive_area");
    if (n.action === "derive_area") {
      expect(n.summary.length).toBeLessThanOrEqual(200);
      expect(n.topic).toBe("ventas");
    }
  });

  it("lookup con el ruteo encendido se conserva", () => {
    const lookup = AgentAction.parse({ action: "lookup", query: "next_class", topic: "academia" });
    expect(normalizeAgentAction(lookup, { routingEnabled: true })).toMatchObject({
      action: "lookup",
      query: "next_class",
      topic: "academia",
    });
  });
});

/* ------------------------------------------------------------------ */
/* US2 — el tema del turno se persiste en el saliente (`message.ai_topic`) */
/* ------------------------------------------------------------------ */

const inserted: Record<string, unknown>[] = [];

vi.mock("@/lib/meta/client", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/meta/client")>();
  return {
    ...original,
    graphRequest: vi.fn(async () => ({ messages: [{ id: `wamid.${inserted.length}` }] })),
  };
});

vi.mock("@/server/whatsapp/credentials", () => ({
  getCredentialsByOrg: async () => ({
    organizationId: "org_1",
    phoneNumberId: "PN",
    token: "tok",
    status: "connected",
  }),
  markReconnectRequired: async () => undefined,
}));

vi.mock("@/server/events/bus", () => ({ publish: () => undefined }));

vi.mock("@/lib/db", () => {
  const chain = (rows: unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "innerJoin", "where", "orderBy"]) c[m] = () => c;
    c.limit = () => Promise.resolve(rows);
    return c;
  };
  return {
    getDb: () => ({
      select: () =>
        chain([
          {
            conversation: {
              id: "cv_1",
              organizationId: "org_1",
              isTest: false,
              lastInboundAt: new Date(),
            },
            contact: { id: "ct_1", phone: "59899000001", waUserId: null },
          },
        ]),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          inserted.push(v);
          return {
            returning: async () => [
              { ...v, createdAt: new Date(), waTimestamp: null, mediaAssetId: null },
            ],
          };
        },
      }),
      update: () => ({ set: () => ({ where: async () => [] }) }),
    }),
    schema: {
      conversation: { contactId: "contactId", id: "id", organizationId: "organizationId" },
      contact: { id: "id" },
      message: {},
    },
  };
});

describe("sendText persiste el tema del turno (US2)", () => {
  beforeEach(() => {
    inserted.length = 0;
  });

  it("saliente de la IA con aiTopic → message.ai_topic", async () => {
    const { sendText } = await import("@/server/inbox/send");
    await sendText({
      conversationId: "cv_1",
      organizationId: "org_1",
      text: "hola",
      aiGenerated: true,
      aiTopic: "ventas",
    });
    expect(inserted[0]).toMatchObject({ origin: "ai", aiTopic: "ventas" });
  });

  it("un saliente que no es de la IA nunca guarda ai_topic", async () => {
    const { sendText } = await import("@/server/inbox/send");
    await sendText({
      conversationId: "cv_1",
      organizationId: "org_1",
      text: "hola",
      aiTopic: "ventas",
    });
    expect(inserted[0]).toMatchObject({ origin: "operator" });
    expect(inserted[0]?.aiTopic ?? null).toBeNull();
  });

  it("sin aiTopic queda NULL (ruteo apagado: como siempre)", async () => {
    const { sendText } = await import("@/server/inbox/send");
    await sendText({ conversationId: "cv_1", organizationId: "org_1", text: "x", aiGenerated: true });
    expect(inserted[0]?.aiTopic ?? null).toBeNull();
  });
});
