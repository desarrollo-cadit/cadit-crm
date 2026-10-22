import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { AudienceFiltersSchema } from "@/lib/marketing/audience";
import { crearAudiencia, listarAudiencias } from "@/server/marketing/audiences";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre.").max(120),
    filters: AudienceFiltersSchema,
  })
  .strict();

/** 045 (FR-005) — Las audiencias guardadas. Sin conteo: se evalúa al abrirla. */
export const GET = requireCapability("marketing.ver", async (session) => {
  return Response.json({ audiences: await listarAudiencias(session.organizationId) });
});

export const POST = requireCapability("marketing.enviar", async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const r = await crearAudiencia(session.organizationId, session.userId, body.data);
  if (!r.ok) return apiError(409, "duplicate", "Ya hay una audiencia con ese nombre.");
  return Response.json(r.audience, { status: 201 });
});
