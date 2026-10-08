import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { getM365Config } from "@/lib/m365/client";
import {
  getAreaConfigs,
  getRoutingEnabled,
  listActiveSellersWithEmail,
  setRoutingEnabled,
} from "@/server/areas/config";
import { organizationTimezone } from "@/server/finanzas-periodo";

export const dynamic = "force-dynamic";

/**
 * 029 — Configuración › Áreas (`contracts/api-areas.md`).
 *
 * Trae los vendedores activos BAJO ESTA MISMA capacidad: pedirlos a
 * `/api/sellers` exigiría además `inscripciones.editar` (DV-003).
 * `m365Configured` es un booleano: la credencial jamás viaja (principio I).
 */
export const GET = requireCapability("areas.configurar", async (session) => {
  const orgId = session.organizationId;
  const [routingEnabled, areas, sellers, timezone] = await Promise.all([
    getRoutingEnabled(orgId),
    getAreaConfigs(orgId),
    listActiveSellersWithEmail(orgId),
    organizationTimezone(orgId),
  ]);
  return Response.json({
    routingEnabled,
    m365Configured: getM365Config() !== null,
    areas,
    sellers,
    timezone,
  });
});

const patchSchema = z.object({ routingEnabled: z.boolean() });

/** Enciende o apaga el ruteo por áreas del agente (DV-012). */
export const PATCH = requireCapability("areas.configurar", async (session, req: Request) => {
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const ok = await setRoutingEnabled(session.organizationId, body.data.routingEnabled);
  if (!ok) {
    return apiError(
      422,
      "agent_not_configured",
      "El agente de IA todavía no está configurado en esta organización."
    );
  }
  return Response.json({ routingEnabled: body.data.routingEnabled });
});
