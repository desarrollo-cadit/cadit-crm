import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist } from "next/font/google";
import { accentCssVariables, DEFAULT_BRANDING } from "@/lib/branding";
import { parseThemeCookie, THEME_COOKIE } from "@/lib/theme";
import { getBranding } from "@/server/branding";
import "./globals.css";

// next/font descarga la fuente en BUILD y la sirve self-hosted (sin CDN).
const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);
  return {
    title: `${branding.name} — Gestor académico`,
    description: "Gestor académico para academia y centro de formación",
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const branding = await getBranding().catch(() => DEFAULT_BRANDING);

  /**
   * 020 (T014) — El tema se resuelve en el SERVIDOR y baja en el `<html>`.
   *
   * Leerlo en el cliente pintaría la primera pantalla en claro y cambiaría un
   * instante después: un fogonazo blanco en cada carga, que es justo lo que
   * alguien elige el tema oscuro para no ver. Es el mismo motivo por el que el
   * acento ya se inyecta así desde la 002.
   */
  const tema = parseThemeCookie((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="es" className={geist.variable} data-theme={tema}>
      <head>
        {/* Acento white-label inyectado en SSR: sin flash de tema */}
        <style
          dangerouslySetInnerHTML={{ __html: accentCssVariables(branding.accent) }}
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
