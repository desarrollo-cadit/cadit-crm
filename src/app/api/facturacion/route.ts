import { z } from "zod";
import { parseQuery, requireCapability } from "@/lib/api";
import { listarFacturacion } from "@/server/facturacion";

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    /** Pendientes (default) o facturadas, para corregir. */
    estado: z.enum(["pendientes", "facturadas"]).optional(),
  })
  .strict();

/**
 * 042 — Las ventas pendientes de facturar (o las ya facturadas).
 *
 * `cobranza.ver`: cada fila lleva el monto pactado, que es el dato que esa
 * capacidad gobierna (igual que Finanzas). Quien tiene `facturacion.editar`
 * sin `cobranza.ver` (un rol armado a mano) puede anotar números pero no ve
 * esta lista: un monto que se muestra sin la capacidad que lo autoriza es un
 * dato que se filtró. Los roles de sistema que tienen una tienen las dos.
 */
export const GET = requireCapability("cobranza.ver", async (session, req: Request) => {
  const query = parseQuery(new URL(req.url), querySchema);
  if (!query.ok) return query.response;
  const estado = query.data.estado ?? "pendientes";
  const filas = await listarFacturacion(session.organizationId, estado);
  return Response.json({ estado, filas });
});
