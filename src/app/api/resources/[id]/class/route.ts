import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { asignarMaterialAClase } from "@/server/resources";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({ classSessionId: z.string().min(1) });

/**
 * 0087 — "Asignar a clase…": mueve un material del grupo a una de SUS clases
 * (deja de ser del grupo y olvida su clase de origen). Misma capacidad que
 * cargar o quitar material.
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const result = await asignarMaterialAClase(session.organizationId, id, body.data.classSessionId);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);
