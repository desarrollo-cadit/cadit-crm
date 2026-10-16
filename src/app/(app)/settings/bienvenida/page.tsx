import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { WelcomeTeamClient } from "@/components/settings/welcome-team-client";

export const dynamic = "force-dynamic";

/**
 * 036 — El equipo que nombra el correo de bienvenida. Gate propio, como cada
 * pantalla de Configuración: el layout deja pasar con más de una capacidad.
 */
export default async function WelcomeTeamSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("configuracion.editar")) redirect("/settings");

  return <WelcomeTeamClient />;
}
