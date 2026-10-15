import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { reprogramarClase } from "@/server/class-changes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const HORA = z.string().regex(/^\d{1,2}:\d{2}$/, "Hora en formato HH:MM");

const postSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD"),
  startTime: HORA.nullable().optional(),
  endTime: HORA.nullable().optional(),
  /** FR-014 — dar clase en un día de receso exige decirlo explícitamente. */
  confirmRecess: z.boolean().optional(),
});

/**
 * 034 (US3, FR-013/FR-014) — Reprograma una clase CANCELADA a un día y hora
 * nuevos. La nueva queda vinculada a la cancelada y se muestra en las dos.
 * En un día de receso responde 409 `en_receso` hasta que llegue la
 * confirmación explícita.
 *
 * `academico.editar`: crea una clase, igual que generar el cronograma.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, postSchema);
    if (!body.ok) return body.response;
    const result = await reprogramarClase(session.organizationId, id, {
      date: body.data.date,
      startTime: body.data.startTime ?? null,
      endTime: body.data.endTime ?? null,
      confirmRecess: body.data.confirmRecess ?? false,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ session: result.data }, { status: 201 });
  }
);
