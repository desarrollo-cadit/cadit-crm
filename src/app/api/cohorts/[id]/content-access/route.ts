import { apiError, requireCapability } from "@/lib/api";
import { estadosDeAccesoDeCohorte } from "@/server/access-expiry";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 043 — Hasta cuándo ve cada alumno de la cohorte sus contenidos, y si la
 * fecha es la calculada o una fijada a mano. `academico.ver`: es un dato de
 * la cursada, no de la venta (Ventas lo ve, no lo cambia).
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await estadosDeAccesoDeCohorte(session.organizationId, id);
    if (!data.cohort) return apiError(404, "not_found", "Grupo no encontrado");
    return Response.json(data);
  }
);
