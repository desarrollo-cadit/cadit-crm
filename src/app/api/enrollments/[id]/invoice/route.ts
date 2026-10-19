import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { MAX_NUMERO } from "@/lib/facturacion";
import { registrarFactura } from "@/server/facturacion";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * `.strict()`: una clave que no sea `invoiceNumber` es un 422, no un campo que
 * se ignora en silencio. Quien mande `amount` acá está probando una puerta.
 * `null` o vacío = borrar (una corrección).
 */
const bodySchema = z
  .object({
    invoiceNumber: z.string().max(MAX_NUMERO, `El número de factura admite hasta ${MAX_NUMERO} caracteres`).nullable(),
  })
  .strict();

/**
 * 042 — Anotar, corregir o borrar el número de factura de una venta.
 *
 * `facturacion.editar` y NO `inscripciones.editar`: esa también cambia montos,
 * moneda y cuotas, y Administración transcribe, no cobra (026). Esta ruta no
 * llama a la edición comercial; escribe el número y quién lo anotó, y nada
 * más. Un número repetido en otra persona se guarda igual y vuelve como
 * `aviso` (ver `avisoDeFacturaRepetida`).
 */
export const PATCH = requireCapability(
  "facturacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const r = await registrarFactura(session.organizationId, id, body.data.invoiceNumber, session.userId);
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ factura: r.factura, aviso: r.aviso });
  }
);
