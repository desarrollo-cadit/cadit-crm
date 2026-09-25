/**
 * cursos-offline (T9) — The pure half of the Vimeo player (constitution 1.4.0,
 * Principle II item 4).
 *
 * No network and no browser API here: which URLs are a Vimeo video, the
 * iframe/page URLs built from them, and the played-range tracker the player
 * component feeds with `timeupdate` samples. The server uses `parseVimeoUrl`
 * too, so "this topic has a video" means the same thing on both sides.
 */

export type VimeoRef = { id: string; hash: string | null };

export interface PlayedRange {
  start: number;
  end: number;
}

const HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);
const ID = /^\d{1,20}$/;
const HASH = /^[0-9a-f]{6,40}$/i;

const asHash = (value: string | null | undefined) => (value && HASH.test(value) ? value : null);

/**
 * `vimeo.com/<id>`, `vimeo.com/<id>/<hash>` (unlisted), `player.vimeo.com/
 * video/<id>[?h=<hash>]`, `vimeo.com/channels/<name>/<id>` and
 * `vimeo.com/groups/<name>/videos/<id>`. Anything else — a showcase, a user
 * page, another host, plain http — is not a video we can embed → `null`.
 */
export function parseVimeoUrl(raw: string | null | undefined): VimeoRef | null {
  const value = raw?.trim();
  if (!value) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !HOSTS.has(url.hostname)) return null;

  const parts = url.pathname.split("/").filter(Boolean);
  const queryHash = asHash(url.searchParams.get("h"));

  if (url.hostname === "player.vimeo.com") {
    const [video, id] = parts;
    return video === "video" && id && ID.test(id) ? { id, hash: queryHash } : null;
  }

  const [first, second, third, fourth] = parts;
  if (first && ID.test(first)) return { id: first, hash: asHash(second) ?? queryHash };
  if (first === "channels" && third && ID.test(third)) return { id: third, hash: null };
  if (first === "groups" && third === "videos" && fourth && ID.test(fourth)) {
    return { id: fourth, hash: null };
  }
  return null;
}

/** The official player. `dnt=1`: the embed does not track the student. */
export function vimeoEmbedUrl(ref: VimeoRef): string {
  const hash = ref.hash ? `h=${encodeURIComponent(ref.hash)}&` : "";
  return `https://player.vimeo.com/video/${ref.id}?${hash}dnt=1`;
}

/** Where to watch it when the embed does not answer (domain restriction, blocker). */
export function vimeoPageUrl(ref: VimeoRef): string {
  return ref.hash ? `https://vimeo.com/${ref.id}/${ref.hash}` : `https://vimeo.com/${ref.id}`;
}

/* ============================================================
 * Played ranges
 * ============================================================ */

/** A forward jump longer than this between two samples is a seek, not playback. */
export const SEEK_GAP_SECONDS = 2;

export interface RangeTracker {
  closed: PlayedRange[];
  current: PlayedRange | null;
}

export const emptyTracker = (): RangeTracker => ({ closed: [], current: null });

const closeCurrent = (t: RangeTracker): PlayedRange[] =>
  t.current && t.current.end > t.current.start ? [...t.closed, t.current] : t.closed;

/**
 * One `timeupdate` sample. Playback extends the current range; a jump
 * forward of more than `SEEK_GAP_SECONDS`, or any jump backwards, closes it
 * and starts a new one at the new position. Only real playback between two
 * close samples adds coverage — seeking to the end adds (almost) nothing.
 */
export function trackTime(t: RangeTracker, seconds: number): RangeTracker {
  if (!Number.isFinite(seconds) || seconds < 0) return t;
  const cur = t.current;
  if (cur && seconds >= cur.end && seconds - cur.end <= SEEK_GAP_SECONDS) {
    return { closed: t.closed, current: { start: cur.start, end: seconds } };
  }
  return { closed: closeCurrent(t), current: { start: seconds, end: seconds } };
}

/** A seek (or pause) ends the current range: the next sample starts a new one. */
export function breakRange(t: RangeTracker): RangeTracker {
  return { closed: closeCurrent(t), current: null };
}

/** Sorted, merged, non-empty. Merging keeps the report small across many seeks. */
export function mergeRanges(ranges: PlayedRange[]): PlayedRange[] {
  const sorted = ranges
    .filter((r) => r.end > r.start)
    .map((r) => ({ start: r.start, end: r.end }))
    .sort((a, b) => a.start - b.start);
  const out: PlayedRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push(r);
  }
  return out;
}

/** Everything played so far, ready to send to the server. */
export function playedRanges(t: RangeTracker): PlayedRange[] {
  return mergeRanges(closeCurrent(t));
}
