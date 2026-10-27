import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import {
  confirmarCohorte,
  estadoDeConfirmacion,
  quitarConfirmacion,
} from "@/server/cohort-confirmation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const confirmarSchema = z.object({ avisar: z.boolean().optional() }).strict();

/**
 * 039 — El estado de confirmación de la cohorte y de sus avisos internos.
 * `academico.ver`: es lo que muestra el encabezado de la cohorte.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await estadoDeConfirmacion(session.organizationId, id);
    if (!data) return apiError(404, "not_found", "Grupo no encontrado");
    return Response.json({ confirmation: data });
  }
);

/**
 * 039 — Confirma la cohorte. Idempotente: confirmar una confirmada no cambia
 * quién ni cuándo. El aviso a Soporte sale DESPUÉS del commit y un fallo del
 * correo no deshace la confirmación. Una confirmación nueva genera el
 * cronograma si el grupo tiene todo (2026-10-27, `generarCronogramaAutomatico`).
 */
export const POST = requireCapability(
  "cohortes.confirmar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    // 2026-10-22 — Sin cuerpo (clientes viejos) se avisa, como antes.
    const body = await parseBody(req, confirmarSchema, { emptyAs: {} });
    if (!body.ok) return body.response;
    const r = await confirmarCohorte(session.organizationId, id, session.userId, {
      avisar: body.data.avisar,
    });
    if (!r.ok) return apiError(r.status, r.code, r.message);
    // 2026-10-27 — `schedule`: «Se generaron N clases» o lo que falta para generarlas.
    return Response.json({ confirmation: r.data, changed: r.cambio, schedule: r.cronograma });
  }
);

/**
 * 039 — Quita la confirmación. Cancela los avisos de facturación que todavía
 * no salieron; lo ya enviado no se des-envía. Idempotente.
 */
export const DELETE = requireCapability(
  "cohortes.confirmar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const r = await quitarConfirmacion(session.organizationId, id);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ confirmation: r.data, changed: r.cambio });
  }
);
