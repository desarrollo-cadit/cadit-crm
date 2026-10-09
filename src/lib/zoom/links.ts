import type { ZoomRecordingMeeting } from "./types";

/**
 * 030 (DV-008) — El enlace que recibe la clase y que copia el staff.
 *
 * El alumno abre UN enlace: si Zoom no embebió el código de acceso, el que
 * le llega le pide algo que no tiene. Por eso, cuando `share_url` no trae
 * `pwd=` pero Zoom informó `recording_play_passcode`, se agrega `pwd=` —el
 * mismo formato que arma Zoom con "Embed passcode in the shareable link"—.
 * [verificar en vivo] con la cuenta real (quickstart §6).
 */
export function buildPlayUrl(
  m: Pick<ZoomRecordingMeeting, "shareUrl" | "playPasscode">
): { url: string | null; passcodeEmbedded: boolean } {
  if (!m.shareUrl) return { url: null, passcodeEmbedded: false };
  if (/[?&]pwd=/.test(m.shareUrl)) return { url: m.shareUrl, passcodeEmbedded: true };
  if (m.playPasscode) {
    const sep = m.shareUrl.includes("?") ? "&" : "?";
    return {
      url: `${m.shareUrl}${sep}pwd=${encodeURIComponent(m.playPasscode)}`,
      passcodeEmbedded: true,
    };
  }
  return { url: m.shareUrl, passcodeEmbedded: false };
}

/**
 * 030 (DV-006) — Número de reunión de una URL de Zoom (`/j/`, `/s/`, `/w/`),
 * o `null` si no es reconocible. Un enlace vanity (`/my/nombre`) no dice el
 * número: devolver `null` es mejor que adivinar, porque este número decide a
 * qué clase va una grabación.
 */
export function extractMeetingId(url: string | null): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  if (host !== "zoom.us" && !host.endsWith(".zoom.us")) return null;

  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
  const m = /^\/(?:j|s|w)\/([\d\s-]+)\/?$/.exec(path);
  if (!m) return null;
  const digits = m[1]!.replace(/[\s-]/g, "");
  return /^\d{9,12}$/.test(digits) ? digits : null;
}
