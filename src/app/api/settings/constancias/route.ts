import { parseBody, requireCapability } from "@/lib/api";
import { configDeConstanciasSchema } from "@/lib/constancia-empresa";
import { getConfigDeConstancias, saveConfigDeConstancias } from "@/server/constancia-empresa";

export const dynamic = "force-dynamic";

/**
 * 2026-10-29 — Quién firma las constancias para empresas (una vez por
 * academia), la ciudad del encabezado y el pie. Es configuración de la
 * academia: `configuracion.editar`, como la marca. A diferencia de la marca,
 * el GET NO es público.
 */
export const GET = requireCapability("configuracion.editar", async (session) => {
  return Response.json({ config: await getConfigDeConstancias(session.organizationId) });
});

export const PUT = requireCapability("configuracion.editar", async (session, req: Request) => {
  const body = await parseBody(req, configDeConstanciasSchema);
  if (!body.ok) return body.response;
  const config = await saveConfigDeConstancias(session.organizationId, body.data);
  return Response.json({ config });
});
