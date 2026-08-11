import { withAuth } from "@/lib/api";
import { listLicenseInventory } from "@/server/licenses";

export const dynamic = "force-dynamic";

/**
 * 005 iteración 2 — inventario de licencias (total vs. disponibles) por
 * software, para el widget del home. A propósito `withAuth` (NO
 * `requireFullAccess`): es información operativa, no financiera — visible
 * también para `role: "soporte"` (pedido explícito en vivo del dueño).
 */
export const GET = withAuth(async (session) => {
  const inventory = await listLicenseInventory(session.organizationId);
  return Response.json({ inventory });
});
