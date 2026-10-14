import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { evaluacionesCongeladas } from "@/server/corrections";
import { cohortGrading, createAssessment } from "@/server/grading";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 010 — Planilla de evaluación de la cohorte.
 *
 * `evaluacion.*` y no una capacidad financiera (DV-003): al no haber notas numéricas
 * la sensibilidad baja, y soporte necesita poder responder "¿aprobé?" igual
 * que responde por el checklist de onboarding (FR-014).
 */
export const GET = requireCapability(
  "evaluacion.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const data = await cohortGrading(session.organizationId, id);
  if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
  /*
    031 (DV-008) — Qué plantillas quedaron congeladas, para que el editor las
    abra así y nadie arme un cambio entero para enterarse del 409 al final.
    Se suma acá y no en `cohortGrading`: esa planilla la leen también el
    certificado y el portal del profesor, que no editan plantillas.
  */
  const congeladas = await evaluacionesCongeladas(session.organizationId, id);
  return Response.json({
    ...data,
    assessments: data.assessments.map((a) => ({ ...a, frozen: congeladas.has(a.id) })),
  });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  /** Una evaluación opcional se registra pero no define la aprobación. */
  required: z.boolean().optional(),
});

export const POST = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const result = await createAssessment(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ assessment: result.data }, { status: 201 });
});
