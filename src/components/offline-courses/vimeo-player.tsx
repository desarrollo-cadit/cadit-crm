"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  breakRange,
  emptyTracker,
  playedRanges,
  trackTime,
  vimeoEmbedUrl,
  vimeoPageUrl,
  type PlayedRange,
  type VimeoRef,
} from "@/lib/vimeo";

/**
 * cursos-offline (T9) — THE Vimeo component (constitution 1.4.0, Principle II
 * item 4: browser-only iframe, isolated behind one component). Nothing else in
 * the app loads `player.vimeo.com`; the server never talks to Vimeo.
 *
 * It speaks Vimeo's postMessage player API directly (no npm dependency):
 * subscribes to play / pause / timeupdate / seeked / ended, and accepts
 * messages ONLY from the player origin AND from this iframe's window — any
 * other frame on the page could post a fake `timeupdate`.
 *
 * What it reports is the REAL played ranges (`@/lib/vimeo` tracker), never
 * the `ended` event: on pause, on ended, and at most every ~15 s while
 * playing. Whether that completes the topic is the server's call.
 */

const PLAYER_ORIGIN = "https://player.vimeo.com";
const REPORT_EVERY_MS = 15_000;
const ANSWER_TIMEOUT_MS = 10_000;
const EVENTS = ["play", "pause", "timeupdate", "seeked", "ended"] as const;

export type VimeoProgressReport = { playedRanges: PlayedRange[]; duration: number };

type PlayerMessage = {
  event?: string;
  method?: string;
  value?: unknown;
  data?: { seconds?: unknown; duration?: unknown };
};

function readMessage(raw: unknown): PlayerMessage | null {
  let data = raw;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch {
      return null;
    }
  }
  return data && typeof data === "object" ? (data as PlayerMessage) : null;
}

const asSeconds = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);

export function VimeoPlayer({
  video,
  title,
  onProgress,
}: {
  video: VimeoRef;
  /** The iframe's accessible name. */
  title: string;
  onProgress: (report: VimeoProgressReport) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const onProgressRef = useRef(onProgress);
  const [answered, setAnswered] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  useEffect(() => {
    let tracker = emptyTracker();
    let duration = 0;
    let playing = false;
    let lastReportAt = 0;
    let lastSent = "";

    const post = (message: Record<string, unknown>) =>
      frame.current?.contentWindow?.postMessage(JSON.stringify(message), PLAYER_ORIGIN);

    const subscribe = () => {
      for (const value of EVENTS) post({ method: "addEventListener", value });
      post({ method: "getDuration" });
    };

    const report = () => {
      const ranges = playedRanges(tracker);
      if (ranges.length === 0 || !(duration > 0)) return;
      const body = JSON.stringify(ranges);
      lastReportAt = Date.now();
      // The player may deliver an event twice (subscribed on load AND on
      // ready); the same ranges twice is one report.
      if (body === lastSent) return;
      lastSent = body;
      onProgressRef.current({ playedRanges: ranges, duration });
    };

    function onMessage(ev: MessageEvent) {
      if (ev.origin !== PLAYER_ORIGIN) return;
      if (!frame.current || ev.source !== frame.current.contentWindow) return;
      const msg = readMessage(ev.data);
      if (!msg) return;
      setAnswered(true);

      if (msg.method === "getDuration") duration = asSeconds(msg.value) ?? duration;
      const d = asSeconds(msg.data?.duration);
      if (d !== null && d > 0) duration = d;

      switch (msg.event) {
        case "ready":
          subscribe();
          break;
        case "play":
          playing = true;
          lastReportAt = Date.now();
          break;
        case "timeupdate": {
          const s = asSeconds(msg.data?.seconds);
          if (s !== null) tracker = trackTime(tracker, s);
          if (playing && Date.now() - lastReportAt >= REPORT_EVERY_MS) report();
          break;
        }
        case "seeked":
          tracker = breakRange(tracker);
          break;
        case "pause":
        case "ended":
          playing = false;
          tracker = breakRange(tracker);
          report();
          break;
      }
    }

    const iframe = frame.current;
    // `ready` can fire before this listener exists; subscribing on load too
    // covers that race (duplicates are harmless, see `report`).
    iframe?.addEventListener("load", subscribe);
    window.addEventListener("message", onMessage);
    const timer = window.setTimeout(() => setTimedOut(true), ANSWER_TIMEOUT_MS);
    return () => {
      iframe?.removeEventListener("load", subscribe);
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      // Leaving the page mid-video still counts what was watched.
      tracker = breakRange(tracker);
      report();
    };
  }, [video.id, video.hash]);

  return (
    <div className="space-y-2">
      <div className="relative aspect-video w-full overflow-hidden rounded-md border border-border bg-secondary">
        <iframe
          ref={frame}
          src={vimeoEmbedUrl(video)}
          title={title}
          allow="autoplay; fullscreen; picture-in-picture"
          allowFullScreen
          className="absolute inset-0 h-full w-full"
        />
      </div>
      {timedOut && !answered && (
        <p role="status" className="text-sm text-muted-foreground">
          El reproductor no responde. Puede que el video no permita verse desde este sitio o que
          algo en tu navegador lo esté bloqueando.{" "}
          <a
            href={vimeoPageUrl(video)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-text underline underline-offset-2"
          >
            Verlo en vimeo.com
            <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} />
          </a>
          . Si lo ves allá, pedile a la academia que marque el tema como completado.
        </p>
      )}
    </div>
  );
}
