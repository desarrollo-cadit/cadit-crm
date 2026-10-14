import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { listarPendientes } from "@/server/corrections";

export const dynamic = "force-dynamic";

const query = z.object({
  status: z.literal("pending").optional(),
  cohortId: z.string().min(1).optional(),
});

/**
 * 031 (T033, DV-012) — La bandeja de aprobación: lo que espera que alguien
 * con `correcciones.aprobar` lo apruebe o lo devuelva. Por ahora solo lista
 * `pending`; el parámetro existe para que el contrato no cambie el día que
 * haga falta otro estado.
 */
export const GET = requireCapability("correcciones.aprobar", async (session, req: Request) => {
  const q = parseQuery(new URL(req.url), query);
  if (!q.ok) return q.response;
  const items = await listarPendientes(session.organizationId, {
    cohortId: q.data.cohortId ?? null,
  });
  return Response.json({ items });
});
