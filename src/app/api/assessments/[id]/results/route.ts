import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { recordResults } from "@/server/grading";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  results: z
    .array(
      z.object({
        enrollmentId: z.string().min(1),
        /**
         * `null` es PENDIENTE, no reprobado (FR-005). Por eso es nullable y
         * no un booleano a secas: hace falta poder volver a "sin corregir".
         */
        passed: z.boolean().nullable(),
        notes: z.string().max(1000).nullable().optional(),
      })
    )
    .min(1)
    .max(200),
});

/** 010 — Carga o corrige resultados. Volver a cargar CORRIGE, no duplica. */
export const PATCH = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const result = await recordResults(
    session.organizationId,
    id,
    body.data.results,
    session.userId
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ recorded: result.data.recorded });
});
