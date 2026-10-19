import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sendEnrollmentEmail } from "@/server/email/enrollment-emails";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  kind: z.enum(["terms", "welcome"]),
  /** Reenviar aunque ya conste como enviado (el operador lo confirma en la UI). */
  force: z.boolean().optional(),
});

/**
 * 007 — Envío de los correos transaccionales de una inscripción
 * (constitución 1.3.0, principio II: M365 vía `src/lib/m365`).
 *
 * Igual que el checklist (FR-014): mandar los términos de licencia y la
 * bienvenida es tarea de soporte tanto como de coordinación. No expone datos
 * financieros. 040 (DV-001) — `inscripciones.seguimiento` y no
 * `inscripciones.ver`: el rol Ventas ve la cohorte pero no le escribe a nadie.
 */
export const POST = requireCapability(
  "inscripciones.seguimiento",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const result = await sendEnrollmentEmail(
    session.organizationId,
    id,
    body.data.kind,
    { force: body.data.force }
  );

  if (!result.ok) {
    return apiError(result.status, result.code, result.message);
  }

  return Response.json({
    sentAt: result.sentAt,
    // `true` cuando ya estaba enviado y no se reenvió: la UI lo distingue de
    // un envío nuevo para no decirle al operador que mandó algo que no mandó.
    skipped: result.skipped ?? false,
  });
});
