import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { CampaignBodySchema } from "@/lib/marketing/body";
import { vistaPrevia } from "@/server/marketing/campaigns";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({
    contactId: z.string().min(1).optional(),
    subject: z.string().trim().max(200).optional(),
    body: CampaignBodySchema.optional(),
  })
  .strict();

/**
 * 045 (FR-009) — El MISMO HTML que se enviaría, con un contacto real de la
 * audiencia. Solo lee: `subject`/`body` permiten mirar lo que se está
 * editando sin guardarlo.
 */
export const POST = requireCapability("marketing.ver", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const r = await vistaPrevia(session.organizationId, id, body.data);
  if (!r.ok) return respuestaDeFalla(r);
  return Response.json(r.preview);
});
