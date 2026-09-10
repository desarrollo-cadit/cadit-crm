import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { TeamClient } from "@/components/settings/team-client";

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
export default async function TeamSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("accesos.gestionar")) redirect("/settings");

  return <TeamClient />;
}
