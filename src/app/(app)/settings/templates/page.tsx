import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { TemplatesClient } from "@/components/settings/templates-client";

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
export default async function TemplatesSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("configuracion.editar")) redirect("/settings");

  return <TemplatesClient />;
}
