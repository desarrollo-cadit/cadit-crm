import { apiError, requireCapability } from "@/lib/api";
import { bulkSendOverview, startBulkSend } from "@/server/bulk-sends";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-10-05 — Acceso al portal para los alumnos de la cohorte, de una vez.
 *
 * Revierte T017b de 012 (decisión del dueño), con las salvaguardas que lo
 * hacen seguro: botón explícito y confirmación con los números, de a uno con
 * pausa, y **sin tocar a quien ya tiene acceso** — reinvitarlo le generaría
 * una contraseña nueva y lo dejaría afuera de la cuenta que ya usa.
 *
 * `accesos.gestionar`, la MISMA capacidad que la invitación individual.
 */
export const GET = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const overview = await bulkSendOverview(session.organizationId, id, ["portal_access"]);
    if (!overview) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json({ kinds: overview });
  }
);

/**
 * Responde 202 sin esperar: los correos salen de a uno con pausa para no
 * superar el límite del buzón, y una cohorte entera excede lo que un pedido
 * HTTP puede quedarse abierto.
 */
export const POST = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await startBulkSend(session.organizationId, id, "portal_access", session.userId);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data, { status: 202 });
  }
);
