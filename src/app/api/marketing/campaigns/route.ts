import { z } from "zod";
import { parseBody, parseQuery, requireCapability } from "@/lib/api";
import { CampaignBodySchema } from "@/lib/marketing/body";
import { crearCampana, listarCampanas } from "@/server/marketing/campaigns";
import { respuestaDeFalla } from "@/server/marketing/http";

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    status: z.enum(["borrador", "enviando", "enviada", "cancelada"]).optional(),
    page: z.coerce.number().int().min(1).optional(),
  })
  .strict();

const bodySchema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre.").max(120),
    audienceId: z.string().min(1).optional(),
    subject: z.string().trim().max(200).optional(),
    body: CampaignBodySchema.optional(),
  })
  .strict();

/** 045 (FR-021) — Las campañas, más recientes primero. */
export const GET = requireCapability("marketing.ver", async (session, req: Request) => {
  const q = parseQuery(new URL(req.url), querySchema);
  if (!q.ok) return q.response;
  return Response.json(await listarCampanas(session.organizationId, q.data));
});

/** 045 (FR-007) — Una campaña nace en borrador. */
export const POST = requireCapability("marketing.enviar", async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const r = await crearCampana(session.organizationId, session.userId, body.data);
  if (!r.ok) return respuestaDeFalla(r);
  return Response.json(r.campaign, { status: 201 });
});
