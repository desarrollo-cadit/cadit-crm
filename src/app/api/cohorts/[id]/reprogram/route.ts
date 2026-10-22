import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { reprogramarCohorte, vistaPreviaReprogramacion } from "@/server/cohort-reprogram";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date().nullable(),
});

/**
 * Reprogramar un grupo (fechas nuevas, mismos días y horario): borra las
 * clases sin historia, regenera el cronograma si lo tenía y deja las
 * inscripciones.
 *
 * `academico.editar` y no `cohortes.confirmar`: reprogramar REESCRIBE las
 * fechas y el cronograma, lo mismo que exigen `PATCH /api/cohorts/[id]` y
 * `POST /api/cohorts/[id]/schedule`. Confirmar es decidir que el grupo sale;
 * no da permiso para rearmarlo.
 *
 * GET `?startDate=&endDate=` = vista previa (qué se borra y qué se genera,
 * o por qué no se puede), sin tocar nada.
 */
export const GET = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const url = new URL(req.url);
    const parsed = bodySchema.safeParse({
      startDate: url.searchParams.get("startDate") ?? undefined,
      endDate: url.searchParams.get("endDate") || null,
    });
    if (!parsed.success) return apiError(422, "invalid_body", "Fechas inválidas");
    const plan = await vistaPreviaReprogramacion(session.organizationId, id, parsed.data);
    if (!plan) return apiError(404, "not_found", "Grupo no encontrado");
    return Response.json({ plan });
  }
);

export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const r = await reprogramarCohorte(session.organizationId, id, body.data);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ plan: r.plan });
  }
);
