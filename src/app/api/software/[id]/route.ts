import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { updateSoftware } from "@/server/software";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});

/**
 * 005 (T031, US4, FR-004) — editar el programa del catálogo. Deliberadamente
 * en `/api/software/[id]` (no en la ruta de colección `/api/software`) para
 * seguir el mismo patrón REST que el resto de las rutas de edición del
 * repo (`/api/cohorts/[id]`, `/api/enrollments/[id]/checklist`).
 *
 * 0087 — El cupo ya no se edita acá: es por equipo
 * (`PUT /api/license-teams/[id]/seats`).
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const result = await updateSoftware(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ software: result.software });
});
