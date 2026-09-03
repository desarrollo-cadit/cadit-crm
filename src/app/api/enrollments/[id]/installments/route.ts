import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  generateInstallmentPlan,
  listInstallments,
  listPayments,
  replaceInstallmentPlan,
} from "@/server/billing";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 008 — Plan de cuotas de una inscripción.
 *
 * `cobranza.ver` / `cobranza.editar` (FR-016, DV-005): la cobranza es sección financiera,
 * mismo criterio que el resto de los datos comerciales. Soporte no la ve.
 */
export const GET = requireCapability(
  "cobranza.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const [installments, payments] = await Promise.all([
    listInstallments(session.organizationId, id),
    listPayments(session.organizationId, id),
  ]);
  return Response.json({ installments, payments });
});

const createSchema = z.object({
  count: z.number().int().min(1).max(60),
  firstDueDate: z.coerce.date(),
  /**
   * 008 (T009) — rearmar el plan (refinanciación): anula las cuotas vigentes
   * y crea unas nuevas. Explícito y no automático: cambiar lo pactado no
   * puede ser el efecto de volver a apretar un botón.
   */
  replace: z.boolean().optional(),
});

export const POST = requireCapability(
  "cobranza.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const plan = { count: body.data.count, firstDueDate: body.data.firstDueDate };
  const result = body.data.replace
    ? await replaceInstallmentPlan(session.organizationId, id, plan)
    : await generateInstallmentPlan(session.organizationId, id, plan);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ installments: result.data }, { status: 201 });
});
