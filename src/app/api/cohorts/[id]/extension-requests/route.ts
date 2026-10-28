import { requireCapability } from "@/lib/api";
import { pedidosPendientesDeCohorte } from "@/server/extension-requests";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0083 — Los pedidos de prórroga PENDIENTES de un grupo. `evaluacion.editar`:
 * la MISMA capacidad que otorga prórrogas desde el panel
 * (`/api/assessments/[id]/plazo`), porque decidir un pedido es otorgarla.
 */
export const GET = requireCapability(
  "evaluacion.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const pedidos = await pedidosPendientesDeCohorte(session.organizationId, id);
    return Response.json({ pedidos });
  }
);
