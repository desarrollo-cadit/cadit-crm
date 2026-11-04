import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { moverClase } from "@/server/class-changes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const HORA = z.string().regex(/^\d{1,2}:\d{2}$/, "Hora en formato HH:MM");
const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");

const postSchema = z.object({
  date: DIA,
  startTime: HORA.nullable().optional(),
  endTime: HORA.nullable().optional(),
  /** Dar clase en un día de receso o feriado exige decirlo explícitamente. */
  confirmRecess: z.boolean().optional(),
});

/**
 * 2026-11-04 — Cambia la fecha (y, si se manda, el horario) de una clase viva.
 * Si el día nuevo pasa el fin del grupo, el fin se estira y la entrega final
 * se corre los mismos días en la misma transacción; la respuesta trae `aviso`
 * con lo que cambió. Una clase suspendida, o con asistencia o grabación, no se
 * mueve (409): se repone con su clase de reemplazo.
 *
 * `academico.editar`: mover una clase es editar el cronograma, y estirar el
 * fin y la entrega es editar el grupo (`PATCH /api/cohorts/[id]`).
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, postSchema);
    if (!body.ok) return body.response;
    const result = await moverClase(session.organizationId, id, {
      date: body.data.date,
      startTime: body.data.startTime ?? null,
      endTime: body.data.endTime ?? null,
      confirmRecess: body.data.confirmRecess ?? false,
      puedeMoverFechas: sessionCapabilities(session).includes("academico.editar"),
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ session: result.data });
  }
);
