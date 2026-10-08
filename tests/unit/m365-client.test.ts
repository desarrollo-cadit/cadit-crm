import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 029 (DV-005) — El adaptador de Graph suma copias, Reply-To y bases
 * configurables (para el m365-mock), sin romper a los callers de 007/014.
 */

const env: Record<string, string | undefined> = {};

vi.mock("@/lib/env", () => ({
  getEnv: () => ({ ...env }),
}));

type Call = { url: string; init: RequestInit };
const calls: Call[] = [];

function fakeFetch(sendStatus = 202) {
  return vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("/oauth2/v2.0/token")) {
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 3600 }), {
        status: 200,
      });
    }
    if (sendStatus === 202) return new Response(null, { status: 202 });
    return new Response(JSON.stringify({ error: { message: "rechazado" } }), {
      status: sendStatus,
    });
  });
}

function sentMessage(): Record<string, unknown> {
  const send = calls.find((c) => c.url.endsWith("/sendMail"));
  return JSON.parse(String(send?.init.body)) as Record<string, unknown>;
}

beforeEach(async () => {
  calls.length = 0;
  for (const k of Object.keys(env)) delete env[k];
  Object.assign(env, {
    M365_TENANT_ID: "tenant-1",
    M365_CLIENT_ID: "client-1",
    M365_CLIENT_SECRET: "super-secreto-123",
    M365_SENDER: "cursos@academia.test",
  });
  const { resetM365TokenCache } = await import("@/lib/m365/client");
  resetM365TokenCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendMail — sobre del correo", () => {
  it("`to` como string sigue funcionando (compatibilidad con 007/014)", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const { sendMail } = await import("@/lib/m365/client");
    const r = await sendMail({ to: "a@x.test", subject: "Hola", html: "<p>x</p>" });
    expect(r).toEqual({ ok: true });
    const body = sentMessage();
    const message = body.message as Record<string, unknown>;
    expect(message.toRecipients).toEqual([{ emailAddress: { address: "a@x.test" } }]);
    expect(message.ccRecipients).toBeUndefined();
    expect(message.replyTo).toBeUndefined();
    expect(body.saveToSentItems).toBe(true);
  });

  it("`to: string[]` → varios toRecipients; `cc` → ccRecipients; `replyTo` → replyTo", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const { sendMail } = await import("@/lib/m365/client");
    await sendMail({
      to: ["a@x.test", "b@x.test"],
      cc: ["c@x.test"],
      replyTo: "cliente@x.test",
      subject: "S",
      html: "<p>x</p>",
    });
    const message = sentMessage().message as Record<string, unknown>;
    expect(message.toRecipients).toEqual([
      { emailAddress: { address: "a@x.test" } },
      { emailAddress: { address: "b@x.test" } },
    ]);
    expect(message.ccRecipients).toEqual([{ emailAddress: { address: "c@x.test" } }]);
    expect(message.replyTo).toEqual([{ emailAddress: { address: "cliente@x.test" } }]);
  });

  it("`bcc` se conserva", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const { sendMail } = await import("@/lib/m365/client");
    await sendMail({ to: "a@x.test", bcc: "registro@x.test", subject: "S", html: "x" });
    const message = sentMessage().message as Record<string, unknown>;
    expect(message.bccRecipients).toEqual([{ emailAddress: { address: "registro@x.test" } }]);
  });
});

describe("sendMail — URLs", () => {
  it("sin variables de base usa Entra ID y Graph reales", async () => {
    vi.stubGlobal("fetch", fakeFetch());
    const { sendMail } = await import("@/lib/m365/client");
    await sendMail({ to: "a@x.test", subject: "S", html: "x" });
    expect(calls[0]?.url).toBe(
      "https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token"
    );
    expect(calls[1]?.url).toBe(
      "https://graph.microsoft.com/v1.0/users/cursos%40academia.test/sendMail"
    );
  });

  it("con M365_LOGIN_BASE_URL / M365_GRAPH_BASE_URL usa esas bases (m365-mock)", async () => {
    env.M365_LOGIN_BASE_URL = "http://localhost:3000/api/dev/m365-mock";
    env.M365_GRAPH_BASE_URL = "http://localhost:3000/api/dev/m365-mock/v1.0";
    vi.stubGlobal("fetch", fakeFetch());
    const { sendMail } = await import("@/lib/m365/client");
    await sendMail({ to: "a@x.test", subject: "S", html: "x" });
    expect(calls[0]?.url).toBe(
      "http://localhost:3000/api/dev/m365-mock/tenant-1/oauth2/v2.0/token"
    );
    expect(calls[1]?.url).toBe(
      "http://localhost:3000/api/dev/m365-mock/v1.0/users/cursos%40academia.test/sendMail"
    );
  });
});

describe("sendMail — errores", () => {
  it("un rechazo de Graph devuelve el motivo, nunca el client secret", async () => {
    vi.stubGlobal("fetch", fakeFetch(500));
    const { sendMail } = await import("@/lib/m365/client");
    const r = await sendMail({ to: "a@x.test", subject: "S", html: "x" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("super-secreto-123");
  });

  it("un token rechazado tampoco filtra el secret", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error_description: "AADSTS7000215: secret inválido" }), {
          status: 401,
        })
      )
    );
    const { sendMail } = await import("@/lib/m365/client");
    const r = await sendMail({ to: "a@x.test", subject: "S", html: "x" });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("super-secreto-123");
  });

  it("sin configuración → not_configured", async () => {
    delete env.M365_SENDER;
    vi.stubGlobal("fetch", fakeFetch());
    const { sendMail } = await import("@/lib/m365/client");
    const r = await sendMail({ to: "a@x.test", subject: "S", html: "x" });
    expect(r).toMatchObject({ ok: false, code: "not_configured" });
  });
});
