import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { CampaignBodySchema } from "@/lib/marketing/body";
import { actualizarCampana, borrarCampana, obtenerCampana } from "@/server/marketing/campaigns";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre.").max(120).optional(),
    subject: z.string().trim().max(200).optional(),
    body: CampaignBodySchema.optional(),
    audienceId: z.string().min(1).nullable().optional(),
  })
  .strict();

export const GET = requireCapability("marketing.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const campaign = await obtenerCampana(session.organizationId, id);
  if (!campaign) return apiError(404, "not_found", "Esa campaña no existe.");
  return Response.json(campaign);
});

/** 045 — Solo un borrador se edita (409 `campana_no_editable`). */
export const PATCH = requireCapability("marketing.enviar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const r = await actualizarCampana(session.organizationId, id, body.data);
  if (!r.ok) return respuestaDeFalla(r);
  return Response.json(r.campaign);
});

/** Solo un borrador; borra también sus imágenes del disco. */
export const DELETE = requireCapability("marketing.enviar", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const r = await borrarCampana(session.organizationId, id);
  if (!r.ok) return respuestaDeFalla(r);
  return new Response(null, { status: 204 });
});
