import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { MAX_NUMERO } from "@/lib/facturacion";
import { registrarRecibo } from "@/server/facturacion";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** `.strict()`: solo el número; monto, fecha o método no entran por acá. */
const bodySchema = z
  .object({
    receiptNumber: z.string().max(MAX_NUMERO, `El número de recibo admite hasta ${MAX_NUMERO} caracteres`).nullable(),
  })
  .strict();

/**
 * 042 — Anotar, corregir o borrar el número de recibo de un pago.
 *
 * El recibo es del PAGO (DV-006 de 008). `facturacion.editar` y no
 * `cobranza.editar`: registrar el documento no es registrar ni anular plata.
 * Un pago anulado responde 409 y queda como estaba.
 */
export const PATCH = requireCapability(
  "facturacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const r = await registrarRecibo(session.organizationId, id, body.data.receiptNumber, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ recibo: r.recibo });
  }
);
