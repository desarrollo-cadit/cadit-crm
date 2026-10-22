import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { AudienceFiltersSchema } from "@/lib/marketing/audience";
import { evaluarAudiencia } from "@/server/marketing/audiences";

export const dynamic = "force-dynamic";

const bodySchema = z
  .object({
    filters: AudienceFiltersSchema,
    page: z.number().int().min(1).default(1),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]).default(25),
  })
  .strict();

/**
 * 045 (FR-002, FR-003) — Evalúa filtros sin guardarlos: cantidad, excluidos
 * por motivo y una página de destinatarios (nombre y correo, nada más).
 */
export const POST = requireCapability("marketing.ver", async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;
  const { filters, page, pageSize } = body.data;
  return Response.json(
    await evaluarAudiencia(session.organizationId, filters, { page: page ?? 1, pageSize: pageSize ?? 25 })
  );
});
