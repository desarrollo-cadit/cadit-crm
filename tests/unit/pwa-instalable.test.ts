import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "@/app/manifest";
import { IOS_LAUNCH_SCREENS } from "@/lib/pwa";

const root = process.cwd();

describe("PWA phase 1 — installable portal", () => {
  const m = manifest();

  it("declares a standalone app that starts at the root", () => {
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    expect(m.name).toBeTruthy();
  });

  it("has 192 and 512 icons plus a maskable one, all present in public/", () => {
    const icons = m.icons ?? [];
    const sizes = icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const icon of icons) {
      expect(existsSync(join(root, "public", icon.src))).toBe(true);
    }
  });

  it("service worker never caches or intercepts requests", () => {
    const sw = readFileSync(join(root, "public", "sw.js"), "utf8")
      // strip comments so the explanatory header cannot trip the checks
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(sw).not.toMatch(/["']fetch["']/);
    expect(sw).not.toMatch(/\bcaches\b/);
  });

  it("installed-app chrome only exists under display-mode: standalone", () => {
    const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
    // hidden by default, shown only in the installed app on phones
    expect(css).toMatch(/\.solo-pwa-movil\s*\{\s*display:\s*none/);
    expect(css).toMatch(
      /@media \(display-mode: standalone\) and \(max-width: 767px\)\s*\{[\s\S]*?\.solo-pwa-movil\s*\{\s*display:\s*flex/
    );
    expect(css).toMatch(/\.pwa-splash\s*\{\s*display:\s*none/);
  });

  it("bottom bar keeps every sidebar function reachable through 'Más'", () => {
    const nav = readFileSync(join(root, "src/components/portal/portal-nav.tsx"), "utf8");
    // the sheet renders the same `contenido` the desktop sidebar renders
    expect(nav).toMatch(/hoja === "mas" \?\s*\(\s*contenido/);
  });

  it("uses the full screen on iOS: viewport-fit=cover, safe areas and launch images", () => {
    const layout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    expect(layout).toContain('viewportFit: "cover"');
    const nav = readFileSync(join(root, "src/components/portal/portal-nav.tsx"), "utf8");
    expect(nav).toContain("env(safe-area-inset-top)");
    expect(nav).toContain("env(safe-area-inset-bottom)");
    for (const s of IOS_LAUNCH_SCREENS) {
      expect(existsSync(join(root, "public/splash", `launch-${s.w}x${s.h}.png`))).toBe(true);
    }
  });

  it("registers the service worker only from the portal layout", () => {
    const portal = readFileSync(join(root, "src/app/(portal)/layout.tsx"), "utf8");
    const rootLayout = readFileSync(join(root, "src/app/layout.tsx"), "utf8");
    expect(portal).toContain("ServiceWorkerRegister");
    expect(rootLayout).not.toContain("ServiceWorkerRegister");
  });
});
