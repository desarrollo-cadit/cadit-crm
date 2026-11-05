import type { MetadataRoute } from "next";
import { DEFAULT_BRANDING } from "@/lib/branding";
import { PWA_NAVY } from "@/lib/pwa";

/**
 * PWA phase 1 — web app manifest for the student/teacher portal.
 *
 * Static on purpose: it must be servable without a session (the browser
 * fetches it without credentials) and must not read the database. The
 * theme color is the navy of the sidebar (`barra-marca`), which is the same
 * in both themes.
 */
const NAVY = PWA_NAVY;

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${DEFAULT_BRANDING.name} Campus`,
    short_name: DEFAULT_BRANDING.name,
    description: "Campus de academia y centro de formación",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: NAVY,
    theme_color: NAVY,
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
