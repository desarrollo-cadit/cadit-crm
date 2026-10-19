import { apiError, requireCapability } from "@/lib/api";
import {
  confirmarCohorte,
  estadoDeConfirmacion,
  quitarConfirmacion,
} from "@/server/cohort-confirmation";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 039 — El estado de confirmación de la cohorte y de sus avisos internos.
 * `academico.ver`: es lo que muestra el encabezado de la cohorte.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await estadoDeConfirmacion(session.organizationId, id);
    if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json({ confirmation: data });
  }
);

/**
 * 039 — Confirma la cohorte. Idempotente: confirmar una confirmada no cambia
 * quién ni cuándo. El aviso a Soporte sale DESPUÉS del commit y un fallo del
 * correo no deshace la confirmación.
 */
export const POST = requireCapability(
  "cohortes.confirmar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const r = await confirmarCohorte(session.organizationId, id, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ confirmation: r.data, changed: r.cambio });
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
