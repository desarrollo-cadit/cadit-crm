import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { updateSoftware } from "@/server/software";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  totalLicenses: z.number().int().min(0).optional(),
});

/**
 * 005 (T031, US4, FR-004) — editar `totalLicenses`; rechaza si el nuevo
 * total es menor a las licencias `assigned` actuales. Deliberadamente en
 * `/api/software/[id]` (no en la ruta de colección `/api/software`) para
 * seguir el mismo patrón REST que el resto de las rutas de edición del
 * repo (`/api/cohorts/[id]`, `/api/enrollments/[id]/checklist`) — ver
 * reporte final de la fase para el detalle de esta decisión.
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const result = await updateSoftware(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ software: result.software });
});
