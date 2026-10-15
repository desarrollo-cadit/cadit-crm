import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { actualizarReceso, borrarReceso } from "@/server/recesses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const DIA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha en formato AAAA-MM-DD");

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200),
  fromDate: DIA,
  toDate: DIA,
});

/**
 * 034 (FR-010) — Cambiar nombre o fechas. Acortar NO recrea clases; estirar
 * saca las clases sin historia del rango nuevo, igual que al cargarlo.
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, patchSchema);
    if (!body.ok) return body.response;
    const result = await actualizarReceso(session.organizationId, id, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);

/** 034 (FR-010) — Borrar un receso no recrea clases: aparecen al regenerar el cronograma. */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const ok = await borrarReceso(session.organizationId, id);
    if (!ok) return apiError(404, "not_found", "Receso no encontrado");
    return Response.json({ deleted: true });
  }
);
