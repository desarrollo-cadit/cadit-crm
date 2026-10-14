import { apiError, parseBody, requireCapability } from "@/lib/api";
import { templateSchema } from "@/lib/grading-template";
import { guardarPlantilla } from "@/server/grading";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 031 (T012, DV-008) — La plantilla de corrección, desde el panel del STAFF.
 *
 * `evaluacion.editar` y no una capacidad nueva: se está definiendo cómo se
 * corrige la evaluación, que es lo que esa capacidad ya gobierna. El profesor
 * no define plantillas (014/DV-002: tampoco crea evaluaciones).
 *
 * La forma la valida Zod; las reglas de negocio (suma 100, mínimo según la
 * escala, congelamiento) las dice `guardarPlantilla`, con un mensaje que la
 * pantalla muestra tal cual.
 */
export const PUT = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, templateSchema);
    if (!body.ok) return body.response;

    const r = await guardarPlantilla(session.organizationId, id, body.data);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ assessment: r.data });
  }
);
