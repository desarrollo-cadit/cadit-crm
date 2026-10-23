import { apiError, requireCapability } from "@/lib/api";
import { recorridoComercialDelContacto } from "@/server/recorrido-comercial";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 046 (US1, US3; FR-004, FR-007) — Qué cursó de verdad esta persona y qué le
 * podría interesar después.
 *
 * Pide `contactos.ver`, lo mismo que el legajo y la pestaña Seguimiento: son
 * nombres de cursos, grupos y fechas, sin plata. Un contacto ajeno o
 * inexistente es 404, igual que en el legajo.
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await recorridoComercialDelContacto(session.organizationId, id);
    if (!data) return apiError(404, "not_found", "Contacto no encontrado");
    return Response.json(data);
  }
);
