import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { decidirPedido } from "@/server/extension-requests";
import { plazoSchema } from "@/server/submissions";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const decisionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("aprobar"),
    /** Opcional: quien aprueba puede ajustar la fecha pedida. */
    plazo: plazoSchema.nullable().optional(),
    nota: z.string().trim().max(1000).nullable().optional(),
  }),
  z.object({
    decision: z.literal("rechazar"),
    nota: z.string().trim().max(1000).nullable().optional(),
  }),
]);

/**
 * 0083 — Aprobar o rechazar un pedido de prórroga. Aprobar escribe la
 * prórroga (motivo del alumno, autor = quien decide) en la misma transacción.
 */
export const PATCH = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, decisionSchema);
    if (!body.ok) return body.response;

    const r = await decidirPedido(session.organizationId, id, session.userId, body.data);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
