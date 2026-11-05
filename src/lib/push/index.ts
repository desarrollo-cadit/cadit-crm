import webpush from "web-push";
import { loadVapid } from "@/lib/push/vapid";
import type { PushPayload } from "@/lib/push/payload";

/**
 * The ONLY module allowed to talk to a Web Push service (constitution 1.10.0:
 * optional dependency, behind a single adapter, our own VAPID identity, no
 * third-party accounts). `tests/unit/push-adapter-guard.test.ts` fails if
 * `web-push` is imported anywhere else.
 *
 * Sending NEVER throws: a push failure must not undo the business action that
 * triggered it (e.g. a published correction).
 */
export type PushTarget = { endpoint: string; p256dh: string; auth: string };

export type PushResult =
  | { ok: true }
  | { ok: false; gone: boolean; status?: number; error: string };

export function pushDisponible(): boolean {
  return loadVapid() !== null;
}

export function clavePublicaVapid(): string | null {
  return loadVapid()?.publicKey ?? null;
}

export async function enviarPush(
  target: PushTarget,
  payload: PushPayload
): Promise<PushResult> {
  const vapid = loadVapid();
  if (!vapid) return { ok: false, gone: false, error: "push_no_configurado" };
  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: { p256dh: target.p256dh, auth: target.auth } },
      JSON.stringify(payload),
      {
        vapidDetails: {
          subject: vapid.subject,
          publicKey: vapid.publicKey,
          privateKey: vapid.privateKey,
        },
        TTL: 60 * 60,
        urgency: "normal",
        timeout: 10_000,
      }
    );
    return { ok: true };
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    return {
      ok: false,
      // 404/410: the browser dropped the subscription; it will never work again.
      gone: status === 404 || status === 410,
      status,
      error: err instanceof Error ? err.message : "error_desconocido",
    };
  }
}
