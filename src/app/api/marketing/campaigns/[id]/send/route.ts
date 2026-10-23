import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { confirmarEnvio } from "@/server/marketing/campaigns";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** La cantidad que la persona vio en "Se enviará a N personas" (FR-019). */
const bodySchema = z.object({ expectedCount: z.number().int().min(0) }).strict();

/**
 * 045 (FR-019, contracts/send-and-cancel.md) — Confirma el envío. Todo o nada
 * en la transacción del pedido; el ejecutor arranca después del commit.
 */
export const POST = requireCapability("marketing.enviar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const r = await confirmarEnvio(session, id, body.data.expectedCount);
  if (!r.ok) return respuestaDeFalla(r);
  return Response.json({ campaignId: r.campaignId, recipientCount: r.recipientCount }, { status: 202 });
});
