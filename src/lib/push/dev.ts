/**
 * Development-only push tools (the "send me a test notification" route and
 * button, and auto-generated VAPID keys).
 *
 * Two independent conditions, both required:
 *  1. `PUSH_DEV_TOOLS=true` (never set in the hosting platform), and
 *  2. the app's own public URL is local: localhost, 127.0.0.1 or a Cloudflare
 *     quick tunnel (`*.trycloudflare.com`).
 *
 * Condition 2 is the guard rail: even if the flag leaks into a real
 * deployment, a real domain can never enable these tools.
 */
export function pushDevToolsEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  if (env.PUSH_DEV_TOOLS !== "true") return false;
  const base = env.APP_BASE_URL;
  if (!base) return false;
  try {
    const host = new URL(base).hostname.toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".trycloudflare.com")
    );
  } catch {
    return false;
  }
}
