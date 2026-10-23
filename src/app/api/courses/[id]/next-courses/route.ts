import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { MAX_SIGUIENTES } from "@/lib/rutas-de-cursos";
import { guardarSiguientes } from "@/server/course-routes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z
  .object({ nextCourseIds: z.array(z.string().trim().min(1).max(200)).max(MAX_SIGUIENTES) })
  .strict();

/**
 * 046 (US2; FR-005, FR-006) — Reemplaza la lista ordenada de cursos
 * siguientes de un curso. Editar rutas es edición académica
 * (`academico.editar`). Idempotente: el mismo pedido deja el mismo estado.
 */
export const PUT = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const r = await guardarSiguientes(session.organizationId, session.userId, id, body.data.nextCourseIds);
    if (!r.ok) return apiError(r.code === "not_found" ? 404 : 422, r.code, r.message);
    return Response.json(r.route);
  }
);
