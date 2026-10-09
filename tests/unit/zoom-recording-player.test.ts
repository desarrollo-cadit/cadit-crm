import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { zoomEmbedUrl } from "@/lib/zoom/links";
import { ZoomRecordingPlayer, isZoomRecording } from "@/components/portal/zoom-recording-player";

/**
 * 030 (constitución 1.7.0, principio II ítem 5) — El reproductor de Zoom en
 * los portales. Lo que se embebe lo decide UNA lista de permitidos: solo
 * https, solo `zoom.us` o un subdominio, solo `/rec/share/` o `/rec/play/`.
 * Cualquier otra cosa —un host parecido, `javascript:`, un enlace de reunión—
 * sigue siendo el enlace de siempre y NUNCA un iframe.
 */

describe("zoomEmbedUrl — la lista de permitidos", () => {
  it.each([
    "https://us06web.zoom.us/rec/share/AbC-123_x.yz?startTime=1&pwd=s3cr3t",
    "https://zoom.us/rec/share/AAA",
    "https://us02web.zoom.us/rec/play/BBB?continueMode=true",
    "https://ZOOM.US/rec/share/CCC",
  ])("acepta %s", (url) => {
    expect(zoomEmbedUrl(url)).not.toBeNull();
  });

  it("conserva la query completa, pwd incluido", () => {
    const url = "https://us06web.zoom.us/rec/share/AbC?startTime=1700000000&pwd=a%2Bb";
    const out = zoomEmbedUrl(url)!;
    const parsed = new URL(out);
    expect(parsed.searchParams.get("pwd")).toBe("a+b");
    expect(parsed.searchParams.get("startTime")).toBe("1700000000");
    expect(parsed.pathname).toBe("/rec/share/AbC");
  });

  it.each([
    ["http (sin TLS)", "http://zoom.us/rec/share/AAA"],
    ["otro host", "https://vimeo.com/rec/share/AAA"],
    ["host parecido con zoom.us adelante", "https://zoom.us.evil.com/rec/share/AAA"],
    ["host que termina en zoom.us sin punto", "https://evilzoom.us/rec/share/AAA"],
    ["credenciales en la URL", "https://zoom.us@evil.com/rec/share/AAA"],
    ["usuario en un host de zoom", "https://x:y@zoom.us/rec/share/AAA"],
    ["puerto explícito", "https://zoom.us:8443/rec/share/AAA"],
    ["javascript:", "javascript:alert(1)//zoom.us/rec/share/AAA"],
    ["data:", "data:text/html,<p>zoom.us/rec/share/</p>"],
    ["sin path", "https://zoom.us"],
    ["/rec/share/ vacío", "https://zoom.us/rec/share/"],
    ["enlace de reunión, no de grabación", "https://us06web.zoom.us/j/123456789?pwd=x"],
    ["/rec/ a secas", "https://zoom.us/rec/AAA"],
    ["path que solo empieza parecido", "https://zoom.us/rec/shareX/AAA"],
    ["texto que no es URL", "no es una url"],
    ["vacío", ""],
    ["null", null],
  ])("rechaza: %s", (_caso, url) => {
    expect(zoomEmbedUrl(url as string | null)).toBeNull();
  });
});

const html = (url: string) =>
  renderToStaticMarkup(createElement(ZoomRecordingPlayer, { url, title: "Grabación de la clase 3" }));

describe("ZoomRecordingPlayer — el iframe y su salida de emergencia", () => {
  const SHARE = "https://us06web.zoom.us/rec/share/AbC?pwd=s3cr3t";

  it("un enlace permitido se embebe con lo que el reproductor necesita", () => {
    const out = html(SHARE);
    expect(out).toContain("<iframe");
    expect(out).toContain('src="https://us06web.zoom.us/rec/share/AbC?pwd=s3cr3t"');
    expect(out).toContain('allow="autoplay; fullscreen; picture-in-picture"');
    expect(out).toMatch(/allowFullScreen=""/i);
    expect(out).toContain('title="Grabación de la clase 3"');
    expect(out).toContain('loading="lazy"');
    expect(out).toMatch(/referrerPolicy="strict-origin-when-cross-origin"/i);
    expect(out).toContain("aspect-video");
  });

  it("el sandbox deja correr al reproductor pero no navegar la página de arriba", () => {
    const sandbox = /sandbox="([^"]*)"/.exec(html(SHARE))?.[1]?.split(/\s+/) ?? [];
    for (const flag of [
      "allow-scripts",
      "allow-same-origin",
      "allow-forms",
      "allow-popups",
      "allow-popups-to-escape-sandbox",
      "allow-presentation",
    ]) {
      expect(sandbox).toContain(flag);
    }
    expect(sandbox.some((f) => f.startsWith("allow-top-navigation"))).toBe(false);
  });

  it("siempre ofrece 'Abrir en Zoom' en otra pestaña: una falla del iframe no se puede detectar", () => {
    const out = html(SHARE);
    expect(out).toContain("Abrir en Zoom");
    expect(out).toMatch(/<a[^>]*href="https:\/\/us06web\.zoom\.us\/rec\/share\/AbC\?pwd=s3cr3t"[^>]*target="_blank"/);
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it("un enlace que no es de grabación de Zoom no renderiza nada", () => {
    expect(html("https://zoom.us.evil.com/rec/share/AAA")).toBe("");
    expect(html("https://drive.example.com/video")).toBe("");
  });

  it("isZoomRecording dice lo mismo que la lista de permitidos", () => {
    expect(isZoomRecording(SHARE)).toBe(true);
    expect(isZoomRecording("https://youtu.be/x")).toBe(false);
    expect(isZoomRecording(null)).toBe(false);
  });

  it("solo usa colores de tokens", () => {
    const src = readFileSync(
      path.join(process.cwd(), "src", "components", "portal", "zoom-recording-player.tsx"),
      "utf8"
    );
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|bg-white|bg-black|text-white/);
  });
});

/**
 * Constitución 1.7.0: el reproductor de Zoom vive tras UN componente. Un
 * segundo lugar que arma el embed es una segunda integración que nadie revisó
 * como tal — mismo guard que el de Vimeo.
 */
describe("030 — Zoom embebido tras un solo componente", () => {
  const sinComentarios = (src: string) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      return statSync(full).isDirectory() ? walk(full) : /\.(tsx?|mjs)$/.test(name) ? [full] : [];
    });
  const rel = (f: string) => path.relative(process.cwd(), f).split(path.sep).join("/");

  it("solo zoom-recording-player.tsx y src/lib/zoom/links.ts usan zoomEmbedUrl", () => {
    const files = walk(path.join(process.cwd(), "src")).filter((f) =>
      sinComentarios(readFileSync(f, "utf8")).includes("zoomEmbedUrl(")
    );
    expect(files.map(rel).sort()).toEqual([
      "src/components/portal/zoom-recording-player.tsx",
      "src/lib/zoom/links.ts",
    ]);
  });

  it("el panel del staff no embebe: sigue siendo el enlace", () => {
    const files = walk(path.join(process.cwd(), "src")).filter((f) =>
      sinComentarios(readFileSync(f, "utf8")).includes("ZoomRecordingPlayer")
    );
    expect(files.map(rel).sort()).toEqual([
      "src/components/portal/portal-cohort-client.tsx",
      "src/components/portal/student-course-client.tsx",
      "src/components/portal/zoom-recording-player.tsx",
    ]);
  });
});
