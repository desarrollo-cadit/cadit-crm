import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn();
vi.mock("web-push", () => ({
  default: {
    sendNotification: (...args: unknown[]) => sendNotification(...args),
    generateVAPIDKeys: () => ({ publicKey: "PUB", privateKey: "PRIV" }),
  },
}));

import { enviarPush } from "@/lib/push";
import { pushDevToolsEnabled } from "@/lib/push/dev";
import { normalizarPayload, safeAppPath } from "@/lib/push/payload";
import { pushSupport, urlBase64ToUint8Array } from "@/lib/push/client-keys";
import { loadVapid } from "@/lib/push/vapid";

const target = { endpoint: "https://push.example/abc", p256dh: "k", auth: "a" };
const payload = normalizarPayload({ title: "T", body: "B" });
const VAPID_ENV = {
  VAPID_PUBLIC_KEY: "pub",
  VAPID_PRIVATE_KEY: "priv",
  VAPID_SUBJECT: "mailto:a@b.co",
};

describe("push payload", () => {
  it("clips title and body and collapses whitespace", () => {
    const p = normalizarPayload({ title: "x".repeat(200), body: "a \n  b " + "y".repeat(300) });
    expect(p.title.length).toBeLessThanOrEqual(40);
    expect(p.body.length).toBeLessThanOrEqual(140);
    expect(p.body.startsWith("a b ")).toBe(true);
  });

  it("only allows in-app paths as destination", () => {
    expect(safeAppPath("/portal/cursadas/enr_1")).toBe("/portal/cursadas/enr_1");
    expect(safeAppPath("https://evil.example")).toBe("/portal");
    expect(safeAppPath("//evil.example")).toBe("/portal");
    expect(safeAppPath("/\\evil")).toBe("/portal");
    expect(safeAppPath(undefined)).toBe("/portal");
  });
});

describe("push dev tools gate", () => {
  it("needs the flag AND a local or tunnel URL", () => {
    expect(pushDevToolsEnabled({ PUSH_DEV_TOOLS: "true", APP_BASE_URL: "http://localhost:3000" })).toBe(true);
    expect(
      pushDevToolsEnabled({ PUSH_DEV_TOOLS: "true", APP_BASE_URL: "https://abc-def.trycloudflare.com" })
    ).toBe(true);
    // a real domain never enables it, even with the flag leaked in
    expect(pushDevToolsEnabled({ PUSH_DEV_TOOLS: "true", APP_BASE_URL: "https://campus.cadit.uy" })).toBe(false);
    expect(
      pushDevToolsEnabled({ PUSH_DEV_TOOLS: "true", APP_BASE_URL: "https://trycloudflare.com.evil.example" })
    ).toBe(false);
    expect(pushDevToolsEnabled({ APP_BASE_URL: "http://localhost:3000" })).toBe(false);
    expect(pushDevToolsEnabled({ PUSH_DEV_TOOLS: "true" })).toBe(false);
  });
});

describe("VAPID keys", () => {
  it("is off with no keys outside dev tools", () => {
    expect(loadVapid({ APP_BASE_URL: "https://campus.cadit.uy" })).toBeNull();
  });

  it("treats REEMPLAZA placeholders as unset", () => {
    expect(
      loadVapid({
        VAPID_PUBLIC_KEY: "REEMPLAZA_x",
        VAPID_PRIVATE_KEY: "REEMPLAZA_y",
        APP_BASE_URL: "https://campus.cadit.uy",
      })
    ).toBeNull();
  });

  it("uses configured keys", () => {
    expect(loadVapid(VAPID_ENV)).toEqual({
      publicKey: "pub",
      privateKey: "priv",
      subject: "mailto:a@b.co",
    });
  });
});

describe("enviarPush (adapter, web-push mocked)", () => {
  beforeEach(() => {
    sendNotification.mockReset();
    Object.assign(process.env, VAPID_ENV);
  });

  it("returns ok on success and sends the minimal JSON payload", async () => {
    sendNotification.mockResolvedValue({});
    const r = await enviarPush(target, payload);
    expect(r).toEqual({ ok: true });
    const [sub, body] = sendNotification.mock.calls[0] as [{ endpoint: string }, string];
    expect(sub.endpoint).toBe(target.endpoint);
    expect(JSON.parse(body)).toEqual(payload);
  });

  it("marks 410 and 404 as gone (dead subscription)", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("gone"), { statusCode: 410 }));
    expect(await enviarPush(target, payload)).toMatchObject({ ok: false, gone: true, status: 410 });
    sendNotification.mockRejectedValue(Object.assign(new Error("nf"), { statusCode: 404 }));
    expect(await enviarPush(target, payload)).toMatchObject({ ok: false, gone: true });
  });

  it("never throws: a push outage is a failed result, not an exception", async () => {
    sendNotification.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 503 }));
    const r = await enviarPush(target, payload);
    expect(r).toMatchObject({ ok: false, gone: false, status: 503 });
  });
});

describe("client helpers", () => {
  it("decodes a base64url VAPID key", () => {
    const bytes = urlBase64ToUint8Array("AQID"); // 0x01 0x02 0x03
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });

  it("explains iOS Safari tabs as 'needs install', not 'unsupported'", () => {
    const base = { hasServiceWorker: true, hasNotification: false, hasPushManager: false };
    expect(pushSupport({ ...base, isIos: true })).toBe("needs_install");
    expect(pushSupport({ ...base, isIos: false })).toBe("unsupported");
    expect(
      pushSupport({ hasServiceWorker: true, hasPushManager: true, hasNotification: true, isIos: true })
    ).toBe("supported");
  });
});
