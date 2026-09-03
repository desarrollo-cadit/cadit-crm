import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { voidPayment } from "@/server/billing";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /** Obligatorio: un pago anulado sin motivo es un agujero en la caja del mes. */
  reason: z.string().trim().min(1).max(500),
});

/**
 * 008 (FR-006) — Anula un pago. NO lo borra: el registro queda con su motivo
 * y deja de contar para saldos y para la caja. Un pago que desaparece deja el
 * mes sin explicación.
 */
export const POST = requireCapability(
  "cobranza.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const result = await voidPayment(session.organizationId, id, {
    reason: body.data.reason,
    voidedBy: session.userId,
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ payment: result.data });
});
