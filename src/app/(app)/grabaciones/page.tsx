import { redirect } from "next/navigation";
import { getSessionOrNull } from "@/lib/auth/session";
import { sessionCapabilities } from "@/lib/capabilities";
import { withTenantTransaction } from "@/lib/db/with-tenant";
import { organizationTimezone } from "@/server/finanzas-periodo";
import { listVirtualRooms } from "@/server/virtual-rooms";
import { RecordingsClient } from "@/components/recordings/recordings-client";

export const dynamic = "force-dynamic";

/**
 * 030 US1 — Grabaciones de Zoom.
 *
 * Gate en el servidor y no solo en el menú: un enlace oculto sigue siendo una
 * URL que se puede escribir a mano. Las rutas tienen su propio
 * `requireCapability`; esto decide qué VE la persona, y dice lo mismo.
 *
 * Las aulas del filtro incluyen las archivadas: una grabación vieja se trajo
 * de un aula que hoy puede estar de baja, y tiene que poder filtrarse igual.
 */
export default async function GrabacionesPage() {
  const session = await getSessionOrNull();
  if (!session) redirect("/login");
  const capabilities = sessionCapabilities(session);
  if (!capabilities.includes("grabaciones.ver")) redirect("/");

  const { timezone, rooms } = await withTenantTransaction(session, async () => ({
    timezone: await organizationTimezone(session.organizationId),
    rooms: await listVirtualRooms(session.organizationId, { includeArchived: true }),
  }));

  return (
    <RecordingsClient
      timezone={timezone}
      rooms={rooms.map((r) => ({ id: r.id, name: r.name }))}
      canManage={capabilities.includes("grabaciones.gestionar")}
      canConfigure={capabilities.includes("configuracion.editar")}
    />
  );
}
