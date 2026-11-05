/**
 * Pure payload rules for a push notification. The lock screen is visible to
 * anyone holding the phone, so the payload is deliberately minimal: a title, a
 * short sentence and a destination inside the app. Never grades or amounts.
 */
export type PushPayload = {
  title: string;
  body: string;
  /** Always an in-app path (starts with a single "/"). */
  url: string;
  /** Same tag replaces the previous notification instead of stacking. */
  tag?: string;
};

const MAX_TITLE = 40;
const MAX_BODY = 140;
const DEFAULT_URL = "/portal";

function clip(value: string, max: number): string {
  const v = value.replace(/\s+/g, " ").trim();
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

/** Only in-app paths: "//evil.com" and absolute URLs fall back to the home. */
export function safeAppPath(url: string | undefined): string {
  if (!url) return DEFAULT_URL;
  const u = url.trim();
  if (!u.startsWith("/") || u.startsWith("//") || u.includes("\\")) return DEFAULT_URL;
  return u;
}

export function normalizarPayload(input: {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}): PushPayload {
  const title = clip(input.title, MAX_TITLE) || "Aviso";
  const tag = input.tag ? clip(input.tag, 64) : undefined;
  return {
    title,
    body: clip(input.body, MAX_BODY),
    url: safeAppPath(input.url),
    ...(tag ? { tag } : {}),
  };
}
