import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { BrandingClient } from "@/components/settings/branding-client";
import { ConstanciaSettings } from "@/components/settings/constancia-settings";

export const dynamic = "force-dynamic";

/**
 * Gate propio, y no alcanza con el del layout de la sección.
 *
 * Ese layout deja pasar a quien tenga `configuracion.editar` **o**
 * `accesos.gestionar`, que no son la misma cosa: Coordinación tiene la
 * segunda y no la primera. Sin este corte, entraba a esta pantalla y la veía
 * entera, con las llamadas a la API contestándole 403.
 *
 * Es lo que `nav.ts` llama "una puerta cerrada con cartel de bienvenida".
 */
export default async function BrandingSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("configuracion.editar")) redirect("/settings");

  return (
    <div className="space-y-6">
      <BrandingClient />
      {/* 2026-10-29 — Firma, ciudad y pie de las constancias para empresas. */}
      <ConstanciaSettings />
    </div>
  );
}
