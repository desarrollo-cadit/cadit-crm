import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { recordPayment } from "@/server/billing";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const createSchema = z.object({
  /** NULL/omitido = pago a cuenta, sin imputar a una cuota puntual. */
  installmentId: z.string().min(1).nullable().optional(),
  amount: z.number().int().min(1),
  paidAt: z.coerce.date(),
  method: z.enum(["efectivo", "transferencia", "tarjeta", "otro"]),
  receiptNumber: z.string().max(60).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  /**
   * FR-011 — clave por intento que manda el formulario. Un segundo POST con
   * la misma devuelve el pago ya creado en vez de duplicarlo: doble click en
   * "Registrar pago" no cobra dos veces.
   */
  idempotencyKey: z.string().max(120).nullable().optional(),
});

/** 008 — Registro de un pago. Admite el pago PARCIAL de una cuota (DV-002). */
export const POST = requireCapability(
  "cobranza.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const result = await recordPayment(session.organizationId, id, {
    installmentId: body.data.installmentId ?? null,
    amount: body.data.amount,
    paidAt: body.data.paidAt,
    method: body.data.method,
    receiptNumber: body.data.receiptNumber ?? null,
    notes: body.data.notes ?? null,
    idempotencyKey: body.data.idempotencyKey ?? null,
    recordedBy: session.userId,
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ payment: result.data }, { status: 201 });
});
