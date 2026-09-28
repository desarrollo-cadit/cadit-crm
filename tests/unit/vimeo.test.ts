import { describe, expect, it } from "vitest";
import {
  SEEK_GAP_SECONDS,
  breakRange,
  createReportQueue,
  emptyTracker,
  mergeRanges,
  normalizePlayerMessage,
  parseVimeoUrl,
  playedRanges,
  trackTime,
  vimeoEmbedUrl,
  vimeoPageUrl,
  type RangeTracker,
} from "@/lib/vimeo";

/**
 * cursos-offline (T9) — The pure half of the Vimeo player: which URLs are a
 * Vimeo video, and which parts of it were really played.
 *
 * The ranges are what the server measures completion from, so a seek to the
 * end must never look like watching up to the end.
 */

describe("parseVimeoUrl", () => {
  it("reads a public link", () => {
    expect(parseVimeoUrl("https://vimeo.com/900000001")).toEqual({ id: "900000001", hash: null });
    expect(parseVimeoUrl("https://www.vimeo.com/900000001")).toEqual({ id: "900000001", hash: null });
  });

  it("keeps the hash of an unlisted link", () => {
    expect(parseVimeoUrl("https://vimeo.com/900000001/a1b2c3d4e5")).toEqual({
      id: "900000001",
      hash: "a1b2c3d4e5",
    });
  });

  it("reads a player link, with or without ?h=", () => {
    expect(parseVimeoUrl("https://player.vimeo.com/video/900000003")).toEqual({
      id: "900000003",
      hash: null,
    });
    expect(parseVimeoUrl("https://player.vimeo.com/video/900000003?h=abc123def&dnt=1")).toEqual({
      id: "900000003",
      hash: "abc123def",
    });
  });

  it("reads channel and group links", () => {
    expect(parseVimeoUrl("https://vimeo.com/channels/staffpicks/123456")).toEqual({
      id: "123456",
      hash: null,
    });
    expect(parseVimeoUrl("https://vimeo.com/groups/cad/videos/654321")).toEqual({
      id: "654321",
      hash: null,
    });
  });

  it("tolerates surrounding spaces and a trailing slash", () => {
    expect(parseVimeoUrl("  https://vimeo.com/42/  ")).toEqual({ id: "42", hash: null });
  });

  it("rejects anything that is not an https Vimeo video", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "not a url",
      "http://vimeo.com/123",
      "https://evil.example/123",
      "https://vimeo.com.evil.example/123",
      "https://vimeo.com/showcase/123",
      "https://vimeo.com/user123",
      "https://player.vimeo.com/video/abc",
      "javascript:alert(1)",
    ]) {
      expect(parseVimeoUrl(bad), String(bad)).toBeNull();
    }
  });

  it("drops a hash that does not look like one instead of forwarding it", () => {
    expect(parseVimeoUrl("https://player.vimeo.com/video/7?h=<script>")).toEqual({ id: "7", hash: null });
  });
});

describe("embed and page URLs", () => {
  it("embeds with do-not-track and the unlisted hash", () => {
    expect(vimeoEmbedUrl({ id: "7", hash: null })).toBe("https://player.vimeo.com/video/7?dnt=1");
    expect(vimeoEmbedUrl({ id: "7", hash: "abc123" })).toBe(
      "https://player.vimeo.com/video/7?h=abc123&dnt=1"
    );
  });

  it("links to the video page on vimeo.com", () => {
    expect(vimeoPageUrl({ id: "7", hash: null })).toBe("https://vimeo.com/7");
    expect(vimeoPageUrl({ id: "7", hash: "abc123" })).toBe("https://vimeo.com/7/abc123");
  });
});

describe("played-range tracker", () => {
  const feed = (times: number[], start: RangeTracker = emptyTracker()) =>
    times.reduce((t, s) => trackTime(t, s), start);

  it("uses a 2 second gap", () => {
    expect(SEEK_GAP_SECONDS).toBe(2);
  });

  it("continuous playback is one range", () => {
    expect(playedRanges(feed([0, 0.25, 0.5, 1, 1.5, 2]))).toEqual([
      { start: 0, end: 2 },
    ]);
  });

  it("a jump forward of more than 2 seconds starts a new range", () => {
    expect(playedRanges(feed([0, 1, 2, 50, 51]))).toEqual([
      { start: 0, end: 2 },
      { start: 50, end: 51 },
    ]);
  });

  it("a jump backwards starts a new range (and merging keeps it honest)", () => {
    expect(playedRanges(feed([10, 11, 12, 3, 4]))).toEqual([
      { start: 3, end: 4 },
      { start: 10, end: 12 },
    ]);
  });

  it("a seek breaks the range even when the jump is small", () => {
    const t = breakRange(feed([0, 1, 2]));
    expect(playedRanges(feed([3, 4], t))).toEqual([
      { start: 0, end: 2 },
      { start: 3, end: 4 },
    ]);
  });

  it("seeking straight to the end is not watching", () => {
    const ranges = playedRanges(feed([0, 0.5, 599, 600]));
    const covered = ranges.reduce((n, r) => n + (r.end - r.start), 0);
    expect(covered).toBeLessThanOrEqual(1.5);
  });

  it("ignores values that are not finite, non-negative seconds", () => {
    expect(playedRanges(feed([0, Number.NaN, 1, -5, Number.POSITIVE_INFINITY, 2]))).toEqual([
      { start: 0, end: 2 },
    ]);
  });

  it("a single sample is not a range yet", () => {
    expect(playedRanges(feed([5]))).toEqual([]);
  });

  it("does not mutate the previous state", () => {
    const a = feed([0, 1]);
    const snapshot = JSON.stringify(a);
    trackTime(a, 2);
    breakRange(a);
    expect(JSON.stringify(a)).toBe(snapshot);
  });
});

describe("mergeRanges", () => {
  it("merges overlapping and touching ranges and sorts them", () => {
    expect(
      mergeRanges([
        { start: 10, end: 20 },
        { start: 0, end: 5 },
        { start: 5, end: 8 },
        { start: 15, end: 30 },
      ])
    ).toEqual([
      { start: 0, end: 8 },
      { start: 10, end: 30 },
    ]);
  });

  it("drops empty ranges", () => {
    expect(mergeRanges([{ start: 3, end: 3 }])).toEqual([]);
  });
});

describe("normalizePlayerMessage (both player dialects)", () => {
  it("reads the modern dialect, as an object or as a JSON string", () => {
    const modern = { event: "timeupdate", data: { seconds: 12.5, duration: 120, percent: 0.1 } };
    expect(normalizePlayerMessage(modern)).toEqual({ event: "timeupdate", seconds: 12.5, duration: 120 });
    expect(normalizePlayerMessage(JSON.stringify(modern))).toEqual({
      event: "timeupdate",
      seconds: 12.5,
      duration: 120,
    });
    expect(normalizePlayerMessage({ event: "seeked", data: { seconds: 100 } })).toMatchObject({ event: "seeked" });
    expect(normalizePlayerMessage({ event: "ended" })).toMatchObject({ event: "ended" });
  });

  it("maps the legacy names (what Vimeo answers to string messages) onto the modern ones", () => {
    const progress = JSON.stringify({
      event: "playProgress",
      data: { seconds: "3.2", percent: "0.027", duration: "119.9" },
    });
    expect(normalizePlayerMessage(progress)).toEqual({ event: "timeupdate", seconds: 3.2, duration: 119.9 });
    expect(normalizePlayerMessage({ event: "seek", data: { seconds: 80 } })).toMatchObject({ event: "seeked" });
    expect(normalizePlayerMessage('{"event":"finish"}')).toMatchObject({ event: "ended" });
    expect(normalizePlayerMessage({ event: "pause" })).toMatchObject({ event: "pause" });
    expect(normalizePlayerMessage({ event: "play" })).toMatchObject({ event: "play" });
    expect(normalizePlayerMessage({ event: "ready" })).toMatchObject({ event: "ready" });
  });

  it("reads the getDuration answer as a duration", () => {
    expect(normalizePlayerMessage({ method: "getDuration", value: 95 })).toEqual({
      event: null,
      seconds: null,
      duration: 95,
    });
    expect(normalizePlayerMessage('{"method":"getDuration","value":"95.5"}')).toMatchObject({ duration: 95.5 });
  });

  it("ignores what is not a player message, and bad numbers", () => {
    expect(normalizePlayerMessage("not json")).toBeNull();
    expect(normalizePlayerMessage(null)).toBeNull();
    expect(normalizePlayerMessage(42)).toBeNull();
    expect(normalizePlayerMessage({ event: "somethingElse" })).toEqual({ event: null, seconds: null, duration: null });
    expect(normalizePlayerMessage({ event: "timeupdate", data: { seconds: -1, duration: "x" } })).toEqual({
      event: "timeupdate",
      seconds: null,
      duration: null,
    });
  });
});

describe("createReportQueue (never two reports in flight)", () => {
  function deferredSender() {
    const calls: Array<{ value: number; resolve: () => void; reject: (e: unknown) => void }> = [];
    const send = (value: number) =>
      new Promise<void>((resolve, reject) => {
        calls.push({ value, resolve, reject });
      });
    return { calls, send };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("sends at once when idle, and only the LATEST report once the previous resolves", async () => {
    const { calls, send } = deferredSender();
    const push = createReportQueue(send);
    push(1);
    push(2);
    push(3);
    expect(calls.map((c) => c.value)).toEqual([1]);
    calls[0]!.resolve();
    await tick();
    expect(calls.map((c) => c.value)).toEqual([1, 3]);
    calls[1]!.resolve();
    await tick();
    expect(calls).toHaveLength(2);
    push(4);
    expect(calls.map((c) => c.value)).toEqual([1, 3, 4]);
  });

  it("a failed report does not block the next one", async () => {
    const { calls, send } = deferredSender();
    const push = createReportQueue(send);
    push(1);
    push(2);
    calls[0]!.reject(new Error("network"));
    await tick();
    expect(calls.map((c) => c.value)).toEqual([1, 2]);
  });

  it("a sender that throws synchronously does not wedge the queue", async () => {
    let n = 0;
    const push = createReportQueue((v: number) => {
      n++;
      if (v === 1) throw new Error("boom");
      return Promise.resolve();
    });
    push(1);
    await tick();
    push(2);
    await tick();
    expect(n).toBe(2);
  });
});
