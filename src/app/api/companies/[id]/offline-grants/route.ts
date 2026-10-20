import { apiError, requireCapability } from "@/lib/api";
import { companyOfflineGrants } from "@/server/offline-courses/grants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 045 — Los cursos offline que la gente de una empresa tiene por acceso
 * directo (043), para la ficha de `/empresas`.
 *
 * `contactos.ver`, igual que el reporte de la empresa: Ventas ve quién tiene
 * qué (nombres, cursos y fechas) sin poder cambiarlo. Asignar, extender y
 * quitar siguen siendo las rutas de 043, con `academico.editar`.
 */
export const GET = requireCapability("contactos.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const data = await companyOfflineGrants(session.organizationId, id);
  if (!data) return apiError(404, "not_found", "Empresa no encontrada");
  return Response.json(data);
});
