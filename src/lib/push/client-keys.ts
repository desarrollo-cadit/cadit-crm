/**
 * Browser-side helper (no server imports): `PushManager.subscribe` wants the
 * VAPID public key as bytes, but the server hands it out as base64url text.
 */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport = "supported" | "needs_install" | "unsupported";

/**
 * iOS only exposes `PushManager` to a web app added to the home screen, so a
 * Safari tab on an iPhone is "needs_install", not "unsupported".
 */
export function pushSupport(env: {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  isIos: boolean;
}): PushSupport {
  if (env.hasServiceWorker && env.hasPushManager && env.hasNotification) return "supported";
  if (env.isIos) return "needs_install";
  return "unsupported";
}
