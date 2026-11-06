import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { MAX_NUMERO } from "@/lib/facturacion";
import { registrarFacturaDeEmpresa } from "@/server/facturacion";

export const dynamic = "force-dynamic";

/** `.strict()`: como la ruta de una sola venta, esta tampoco acepta montos ni nada más. */
const bodySchema = z
  .object({
    enrollmentIds: z.array(z.string().min(1)).min(1).max(200),
    invoiceNumber: z.string().max(MAX_NUMERO, `El número de factura admite hasta ${MAX_NUMERO} caracteres`).nullable(),
  })
  .strict();

/**
 * 2026-11-06 — Anotar UNA factura para todos los alumnos de una empresa en un
 * mismo grupo. Misma capacidad que la ruta de una venta (`facturacion.editar`):
 * escribe el número y quién lo anotó, y nada más. Todo o nada; las ventas
 * tienen que ser de la misma empresa y del mismo grupo.
 */
export const PATCH = requireCapability("facturacion.editar", async (session, req: Request) => {
  const body = await parseBody(req, bodySchema);
  if (!body.ok) return body.response;

  const r = await registrarFacturaDeEmpresa(
    session.organizationId,
    body.data.enrollmentIds,
    body.data.invoiceNumber,
    session.userId
  );
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ facturas: r.facturas, avisos: r.avisos });
});
