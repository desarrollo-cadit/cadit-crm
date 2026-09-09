import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { copyAssessments } from "@/server/grading";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const copySchema = z.object({
  /** La cohorte de la que se copia. El destino es el `[id]` de la ruta. */
  fromCohortId: z.string().trim().min(1),
});

/**
 * 014 (T015, DV-009) — Copia las evaluaciones de otra cohorte a ésta.
 *
 * `evaluacion.editar` porque crea evaluaciones: es la misma acción que el POST
 * de `/grading`, hecha de a varias.
 *
 * Copiar y no heredar es deliberado: después de esto las dos cohortes son
 * independientes para siempre, así que cambiar las de una jamás toca a la
 * otra. Es exactamente lo que el dueño quiso evitar con las cohortes en curso.
 */
export const POST = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, copySchema);
    if (!body.ok) return body.response;

    const result = await copyAssessments(
      session.organizationId,
      body.data.fromCohortId,
      id
    );
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json(result.data);
  }
);
