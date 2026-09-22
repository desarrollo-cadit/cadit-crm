import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { issueCertificate, revokeEnrollmentCertificate } from "@/server/certificates";

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

/**
 * 024 (SC-004) — El motivo es la regla, no una validación de forma.
 *
 * Mismo criterio que la dispensa (028, FR-023): una excepción sin autor y sin
 * motivo no se puede revisar después, y anular el título de una persona es
 * exactamente eso. El autor lo pone la sesión; el motivo, quien anula.
 */
const revokeSchema = z.object({
  motivo: z.string().trim().min(3, "Hay que decir por qué se anula"),
});

/**
 * 024 (SC-004) — Anula el certificado de la inscripción.
 *
 * **`DELETE` que no borra**, igual que la revocación de la dispensa: la fila
 * queda con su fecha, su motivo y su autor. Un certificado que desaparece deja
 * sin explicación al alumno que lo tiene impreso en la mano y al empleador que
 * entra a verificarlo — por eso el anulado se sigue viendo, y dice que lo está.
 *
 * `certificados.emitir` y no una capacidad nueva: la lista es CERRADA
 * (`src/lib/capabilities.ts`) y quien puede poner un título en la mano de
 * alguien es quien tiene que poder sacarlo.
 *
 * Anular dos veces responde 409 y NO reescribe la primera anulación
 * (constitución IV): la que vale es la original, con su autor y su motivo.
 */
export const DELETE = requireCapability(
  "certificados.emitir",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, revokeSchema);
    if (!body.ok) return body.response;

    const result = await revokeEnrollmentCertificate(session.organizationId, id, {
      reason: body.data.motivo,
      revokedBy: session.userId,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);

    return Response.json({ certificate: result.data });
  }
);
