import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { listOverdue } from "@/server/billing";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  cohortId: z.string().min(1).optional(),
  minDaysOverdue: z.coerce.number().int().min(0).optional(),
});

/**
 * 008 (T021) — Vista de morosidad: quién debe, cuánto y desde hace cuánto.
 *
 * `cobranza.ver` (FR-016): es información financiera. Ordenada por días
 * de atraso descendente, que es el orden en que se llama a la gente.
 */
export const GET = requireCapability(
  "cobranza.ver",
  async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;

  const data = await listOverdue(session.organizationId, {
    cohortId: query.data.cohortId ?? null,
    minDaysOverdue: query.data.minDaysOverdue ?? null,
  });
  return Response.json(data);
});
