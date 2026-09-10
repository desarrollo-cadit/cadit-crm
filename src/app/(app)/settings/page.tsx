import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { primerDestinoDeSettings } from "@/lib/nav";

export const dynamic = "force-dynamic";

/**
 * El índice de Configuración no tiene pantalla propia: manda a la primera
 * pestaña que la persona PUEDE abrir.
 *
 * Antes mandaba siempre a `/settings/whatsapp`, escrito a mano. El layout de
 * la sección deja pasar a quien tenga `configuracion.editar` **o**
 * `accesos.gestionar`, así que Coordinación —que tiene la segunda y no la
 * primera— entraba al asistente de WhatsApp, una pantalla que no puede usar,
 * mientras la barra le mostraba únicamente "Equipo".
 *
 * El destino se DERIVA de las capacidades. Si no hay ninguna pestaña
 * disponible, no se inventa una: se vuelve al inicio, igual que hace el
 * layout con quien no debería estar acá.
 */
export default async function SettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");

  const destino = primerDestinoDeSettings(sessionCapabilities(session));
  redirect(destino ?? "/");
}
