import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { issueCertificate } from "@/server/certificates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  /**
   * 010 (DV-004) — emisión histórica: saltea el requisito de notas y
   * asistencia para las cohortes anteriores al sistema. Explícito y marcado
   * en la fila: nadie lo confunde con una aprobación verificada.
   */
  historical: z.boolean().optional(),
});

/**
 * 010 — Emite el certificado de una inscripción.
 *
 * Idempotente (FR-007): emitir dos veces devuelve el MISMO certificado, no
 * crea otro ni falla. Solo a alumnos aprobados (FR-006), salvo emisión
 * histórica.
 */
export const POST = requireCapability(
  "certificados.emitir",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const result = await issueCertificate(session.organizationId, id, {
    historical: body.data.historical,
    issuedBy: session.userId,
  });
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ certificate: result.data }, { status: 201 });
});
