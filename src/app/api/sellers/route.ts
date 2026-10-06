import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { createSeller, listSellers } from "@/server/sellers";

export const dynamic = "force-dynamic";

/**
 * 2026-10-06 — Vendedores.
 *
 * `inscripciones.editar` y no `configuracion.editar`: quien carga una venta
 * es quien necesita la lista para elegir, y quien sabe que entró un vendedor
 * nuevo. Coordinación inscribe todos los días y NO tiene
 * `configuracion.editar`; con esa capacidad tendría que pedirle a dirección
 * que dé de alta a cada vendedor antes de poder anotar la venta. Soporte no la
 * tiene, igual que no puede fijar el monto de una venta.
 *
 * La lista trae también los archivados (marcados): el formulario de edición
 * necesita mostrar el vendedor que una venta vieja ya tenía.
 */
export const GET = requireCapability("inscripciones.editar", async (session) => {
  return Response.json({ sellers: await listSellers(session.organizationId) });
});

const createSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio").max(120),
  email: z.string().trim().email("El correo no tiene un formato válido").max(200).nullable().optional(),
  userId: z.string().min(1).nullable().optional(),
});

export const POST = requireCapability("inscripciones.editar", async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const result = await createSeller(session.organizationId, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);
  return Response.json({ seller: result.seller }, { status: 201 });
});
