import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { listVirtualRooms } from "@/server/virtual-rooms";
import { ZoomConnectionsClient } from "@/components/settings/zoom-connections-client";

export const dynamic = "force-dynamic";

/**
 * 030 US4 — Configuración › Zoom: conexiones (credenciales cifradas) y qué
 * usuario de Zoom hospeda cada aula.
 *
 * Gate propio con `configuracion.editar`, la misma capacidad que exigen las
 * rutas `/api/settings/zoom/*`. Las aulas llegan armadas desde acá (solo las
 * activas: una archivada no se sincroniza) para no exigir `academico.ver`.
 */
export default async function ZoomSettingsPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  if (!sessionCapabilities(session).includes("configuracion.editar")) redirect("/settings");

  const rooms = await withTenantTransaction(
    { organizationId: session.organizationId, userId: session.userId },
    () => listVirtualRooms(session.organizationId)
  );

  return <ZoomConnectionsClient rooms={rooms.map((r) => ({ id: r.id, name: r.name }))} />;
}
