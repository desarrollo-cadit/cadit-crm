import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { reordenarModulos } from "@/server/courses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Los ids de TODOS los módulos de la especialización, en el orden nuevo. */
  order: z.array(z.string().min(1)).min(1).max(100),
});

/**
 * 028 (seguimiento) — Reordenar los módulos de una especialización (↑/↓).
 *
 * `academico.editar`, la MISMA capacidad que `PATCH /api/cohorts/[id]`: el
 * orden de los módulos es un dato de la cohorte como cualquier otro, y si
 * pidiera otra capacidad habría gente que puede reordenar desde la pestaña y
 * no desde el formulario, o al revés.
 *
 * La regla —que la lista sea exactamente la de sus módulos— vive en
 * `planDeReorden`; la ruta sólo elige el código.
 */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const result = await reordenarModulos(session.organizationId, id, body.data.order);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ positions: result.positions });
  }
);
