import { apiError, parseBody, requireCapability } from "@/lib/api";
import { isConfigArea } from "@/lib/areas";
import { AreaConfigError, areaConfigBodySchema, saveAreaConfig } from "@/server/areas/config";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ area: string }> };

/**
 * 029 — Guarda la configuración de UN área (`ventas` | `soporte`).
 * 039 — También `administracion`: solo recibe avisos internos (facturación
 * pendiente); el agente no le deriva consultas (`AREAS` no la incluye).
 * Upsert por `(organization_id, area)`; un vendedor inexistente o archivado
 * en copia → 422 con su nombre.
 */
export const PUT = requireCapability(
  "areas.configurar",
  async (session, req: Request, ctx: Params) => {
    const { area } = await ctx.params;
    if (!isConfigArea(area)) return apiError(404, "not_found", "Área desconocida");

    const body = await parseBody(req, areaConfigBodySchema);
    if (!body.ok) return body.response;

    try {
      const saved = await saveAreaConfig(session.organizationId, area, body.data, session.userId);
      return Response.json({ area: saved });
    } catch (err) {
      if (err instanceof AreaConfigError) {
        return apiError(422, "invalid_sellers", err.message);
      }
      throw err;
    }
  }
);
