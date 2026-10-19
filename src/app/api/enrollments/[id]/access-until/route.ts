import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { diaDeAccesoSchema } from "@/lib/offline-grants";
import { fijarAccesoHasta } from "@/server/access-expiry";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `.strict()`: solo la fecha. `null` = volver a la calculada. */
const bodySchema = z.object({ accessUntil: diaDeAccesoSchema.nullable() }).strict();

/**
 * 043 — Fijar a mano hasta cuándo ve esta persona los contenidos de la
 * cohorte (más tarde o más temprano que la fecha calculada), o volver a la
 * calculada. Queda quién y cuándo.
 *
 * `academico.editar` y no `inscripciones.editar`: es una decisión sobre la
 * cursada (qué material sigue viendo), no sobre la venta; soporte, que es
 * quien recibe el pedido "no puedo ver la grabación", la tiene, y Ventas no.
 */
export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;
    const r = await fijarAccesoHasta(session.organizationId, id, body.data.accessUntil, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json(r.data);
  }
);
