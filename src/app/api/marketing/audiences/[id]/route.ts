import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { AudienceFiltersSchema } from "@/lib/marketing/audience";
import {
  actualizarAudiencia,
  borrarAudiencia,
  evaluarAudiencia,
  obtenerAudiencia,
} from "@/server/marketing/audiences";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const NO_EXISTE = "Esa audiencia no existe.";

const patchSchema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre.").max(120).optional(),
    filters: AudienceFiltersSchema.optional(),
  })
  .strict()
  .refine((b) => b.name !== undefined || b.filters !== undefined, {
    message: "No hay nada para cambiar.",
  });

/** 045 — La audiencia con la primera página de su vista previa (evaluada ahora). */
export const GET = requireCapability("marketing.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const audience = await obtenerAudiencia(session.organizationId, id);
  if (!audience) return apiError(404, "not_found", NO_EXISTE);
  const preview = await evaluarAudiencia(session.organizationId, audience.filters, {
    page: 1,
    pageSize: 25,
  });
  return Response.json({ ...audience, preview });
});

/**
 * 045 (FR-005, FR-006) — Cambiar una audiencia no altera campañas ya
 * confirmadas: esas congelaron su lista.
 */
export const PATCH = requireCapability("marketing.enviar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;
  const r = await actualizarAudiencia(session.organizationId, id, body.data);
  if (r.ok) return Response.json(r.audience);
  if (r.code === "not_found") return apiError(404, "not_found", NO_EXISTE);
  if (r.code === "duplicate") return apiError(409, "duplicate", "Ya hay una audiencia con ese nombre.");
  return apiError(422, "invalid_body", "No hay nada para cambiar.");
});

/** Las campañas que la usaban conservan su copia de los filtros. */
export const DELETE = requireCapability("marketing.enviar", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  if (!(await borrarAudiencia(session.organizationId, id))) return apiError(404, "not_found", NO_EXISTE);
  return new Response(null, { status: 204 });
});
