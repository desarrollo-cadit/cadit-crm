import { requireCapability } from "@/lib/api";
import { dashboardSummary } from "@/server/dashboard";

export const dynamic = "force-dynamic";

/**
 * 021 — El resumen del día para el inicio.
 *
 * `academico.ver` y no una capacidad financiera: son conteos de cursada y las
 * clases de hoy. **No trae un solo monto** — lo financiero sigue viviendo en
 * `/api/dashboard/finance`, con su propio gate.
 */
export const GET = requireCapability("academico.ver", async (session) => {
  return Response.json(await dashboardSummary(session.organizationId));
});
