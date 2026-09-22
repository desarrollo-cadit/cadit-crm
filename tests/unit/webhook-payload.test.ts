import { describe, expect, it, vi, beforeEach } from "vitest";
import { parseWebhookPayload } from "@/server/inbox/webhook";

/**
 * Validación del payload del webhook de Meta en su frontera.
 *
 * Las dos reglas que gobiernan este archivo, y que son de producto, no de
 * estilo:
 *
 *  - El payload de Meta es un SUPERCONJUNTO en movimiento: el día que agreguen
 *    un campo, un esquema estricto dejaría de ingerir. Todo lo desconocido
 *    pasa de largo intacto.
 *  - Meta manda LOTES. Un mensaje roto no puede llevarse puestos a los otros
 *    nueve: cada ítem se valida por separado y se descarta solo el roto. Lo
 *    que sí es estricto es el objeto del payload y que `entry` sea un
 *    ARREGLO — ahí no hay nada que rescatar y cae el lote entero.
 */

const VERIFY_TOKEN = "token-de-prueba-largo";

function mensaje(id: string) {
  return { id, timestamp: "1722800000", type: "text", from: "5215500000000", text: { body: "hola" } };
}

function sobre(value: Record<string, unknown>, field = "messages") {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA-1", changes: [{ field, value }] }],
  };
}

describe("parseWebhookPayload: el sobre", () => {
  it("un payload real de Meta pasa con sus mensajes", () => {
    const crudo = JSON.stringify(
      sobre({
        messaging_product: "whatsapp",
        metadata: { display_phone_number: "5215500000000", phone_number_id: "PN-1" },
        contacts: [{ profile: { name: "Cliente" }, wa_id: "5215511111111" }],
        messages: [mensaje("wamid.1")],
      })
    );

    const payload = parseWebhookPayload(crudo);

    expect(payload?.entry?.[0]?.changes?.[0]?.value?.messages).toHaveLength(1);
    expect(payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id).toBe("wamid.1");
    expect(payload?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id).toBe("PN-1");
  });

  it("JSON ilegible → null (la ruta responde 200 igual)", () => {
    expect(parseWebhookPayload("{no es json")).toBeNull();
  });

  it("un body que no es objeto → null", () => {
    expect(parseWebhookPayload("[1,2,3]")).toBeNull();
    expect(parseWebhookPayload('"hola"')).toBeNull();
    expect(parseWebhookPayload("null")).toBeNull();
  });

  it("un objeto sin entry no es un error: no hay nada que ingerir", () => {
    const payload = parseWebhookPayload(JSON.stringify({ hola: "mundo" }));
    expect(payload).not.toBeNull();
    expect(payload?.entry).toBeUndefined();
  });

  it("entry que no es arreglo → null: el sobre no se entiende", () => {
    expect(parseWebhookPayload(JSON.stringify({ entry: "no soy un arreglo" }))).toBeNull();
  });
});

describe("parseWebhookPayload: tolerancia a lo desconocido", () => {
  it("un campo nuevo de Meta sobrevive intacto en los tres niveles", () => {
    const entrada = {
      object: "whatsapp_business_account",
      campo_nuevo_de_meta: { lo: "que sea" },
      entry: [
        {
          id: "WABA-1",
          campo_nuevo_en_entry: 7,
          changes: [
            {
              field: "messages",
              campo_nuevo_en_change: true,
              value: {
                messaging_product: "whatsapp",
                metadata: { phone_number_id: "PN-1" },
                campo_nuevo_en_value: ["a", "b"],
                messages: [{ ...mensaje("wamid.1"), referral: { source_url: "https://x" } }],
              },
            },
          ],
        },
      ],
    };

    const payload = parseWebhookPayload(JSON.stringify(entrada));

    expect(payload).toEqual(entrada);
  });

  it("un field desconocido no rompe: llega para que la ruta lo ignore", () => {
    const payload = parseWebhookPayload(
      JSON.stringify(sobre({ algo: "nuevo" }, "account_review_update"))
    );
    expect(payload?.entry?.[0]?.changes?.[0]?.field).toBe("account_review_update");
  });
});

describe("parseWebhookPayload: un ítem roto no descarta el lote", () => {
  it("el mensaje malformado se descarta y sus hermanos siguen", () => {
    const payload = parseWebhookPayload(
      JSON.stringify(
        sobre({
          metadata: { phone_number_id: "PN-1" },
          messages: [
            mensaje("wamid.1"),
            { id: 42, timestamp: "1722800000", type: "text" },
            { timestamp: "1722800000", type: "text" },
            mensaje("wamid.2"),
          ],
        })
      )
    );

    const mensajes = payload?.entry?.[0]?.changes?.[0]?.value?.messages;
    expect(mensajes?.map((m) => m.id)).toEqual(["wamid.1", "wamid.2"]);
  });

  it("el status malformado se descarta y sus hermanos siguen", () => {
    const payload = parseWebhookPayload(
      JSON.stringify(
        sobre({
          metadata: { phone_number_id: "PN-1" },
          statuses: [
            { id: "wamid.1", status: "delivered", timestamp: "1722800000" },
            { status: "read" },
            { id: "wamid.2", status: "read", timestamp: "1722800001" },
          ],
        })
      )
    );

    const estados = payload?.entry?.[0]?.changes?.[0]?.value?.statuses;
    expect(estados?.map((s) => s.id)).toEqual(["wamid.1", "wamid.2"]);
  });

  it("la entry malformada se descarta y sus hermanas siguen", () => {
    const payload = parseWebhookPayload(
      JSON.stringify({
        object: "whatsapp_business_account",
        entry: [
          "no soy una entry",
          { id: "WABA-1", changes: [{ field: "messages", value: { messages: [mensaje("wamid.1")] } }] },
        ],
      })
    );

    expect(payload?.entry).toHaveLength(1);
    expect(payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0]?.id).toBe("wamid.1");
  });

  it("el echo malformado se descarta y sus hermanos siguen", () => {
    const payload = parseWebhookPayload(
      JSON.stringify(
        sobre(
          {
            metadata: { phone_number_id: "PN-1" },
            message_echoes: [{ nada: "util" }, { ...mensaje("wamid.echo"), to: "5215511111111" }],
          },
          "smb_message_echoes"
        )
      )
    );

    const echoes = payload?.entry?.[0]?.changes?.[0]?.value?.message_echoes;
    expect(echoes?.map((e) => e.id)).toEqual(["wamid.echo"]);
  });
});

/* ---------- La ruta: pase lo que pase, 200 ---------- */

const { tareas } = vi.hoisted(() => ({ tareas: [] as Promise<unknown>[] }));

vi.mock("next/server", () => ({
  after: (fn: () => Promise<void>) => {
    tareas.push(fn());
  },
}));

vi.mock("@/lib/env", () => ({
  getEnv: () => ({
    META_WEBHOOK_VERIFY_TOKEN: "token-de-prueba-largo",
    META_APP_SECRET: undefined,
  }),
}));

const procesarMensajes = vi.fn();
const procesarEchoes = vi.fn();
const procesarPlantillas = vi.fn();

vi.mock("@/server/inbox/ingest", () => ({
  processMessagesValue: (v: unknown) => procesarMensajes(v),
  processEchoesValue: (v: unknown) => procesarEchoes(v),
}));

vi.mock("@/server/whatsapp/template-events", () => ({
  processTemplateStatusValue: (id: unknown, v: unknown) => procesarPlantillas(id, v),
}));

async function postear(body: string, token = VERIFY_TOKEN) {
  const { POST } = await import("@/app/api/webhooks/wa/[webhookToken]/route");
  const res = await POST(new Request("http://localhost/webhook", { method: "POST", body }), {
    params: Promise.resolve({ webhookToken: token }),
  });
  await Promise.all(tareas.splice(0));
  return res;
}

describe("POST del webhook", () => {
  beforeEach(() => {
    procesarMensajes.mockReset();
    procesarEchoes.mockReset();
    procesarPlantillas.mockReset();
    tareas.splice(0);
  });

  it("un body basura responde 200 y no ingiere nada", async () => {
    const res = await postear("no soy json");

    expect(res.status).toBe(200);
    expect(procesarMensajes).not.toHaveBeenCalled();
    expect(procesarEchoes).not.toHaveBeenCalled();
    expect(procesarPlantillas).not.toHaveBeenCalled();
  });

  it("un payload con forma inesperada responde 200 y no ingiere nada", async () => {
    const res = await postear(JSON.stringify({ entry: { no: "es un arreglo" } }));

    expect(res.status).toBe(200);
    expect(procesarMensajes).not.toHaveBeenCalled();
  });

  it("un payload válido ingiere, con los campos nuevos de Meta incluidos", async () => {
    const res = await postear(
      JSON.stringify(
        sobre({
          metadata: { phone_number_id: "PN-1" },
          campo_nuevo_en_value: "sobrevive",
          messages: [mensaje("wamid.1")],
        })
      )
    );

    expect(res.status).toBe(200);
    expect(procesarMensajes).toHaveBeenCalledTimes(1);
    expect(procesarMensajes.mock.calls[0]?.[0]).toMatchObject({
      campo_nuevo_en_value: "sobrevive",
      messages: [{ id: "wamid.1" }],
    });
  });

  it("el token equivocado sigue siendo 404 y no ingiere nada", async () => {
    const res = await postear(JSON.stringify(sobre({ messages: [mensaje("wamid.1")] })), "otro");

    expect(res.status).toBe(404);
    expect(procesarMensajes).not.toHaveBeenCalled();
  });
});
