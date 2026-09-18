import { apiError } from "@/lib/api";
import { requireTeacherPortal } from "@/lib/portal-api";
import { entregasDeCohorte } from "@/server/submissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 016 (US2, US3) — Las entregas de la cohorte, como las ve el profesor.
 *
 * Una cohorte que no alcanza responde **404**, igual que una inexistente: un
 * 403 confirmaría que existe (SC-002 de 014). El alcance incluye la suplencia,
 * porque quien cubrió una clase también corrige lo de esa clase.
 */
export const GET = requireTeacherPortal(
  async (ctx, _req: Request, routeCtx: Params) => {
    const { id } = await routeCtx.params;
    const data = await entregasDeCohorte(ctx.organizationId, ctx.teacherId, id);
    if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
    // FR-005e — viaja `timezone` junto a las entregas: el plazo se pinta con la
    // zona de la academia y no con el reloj de quien mira.
    return Response.json(data);
  }
);
