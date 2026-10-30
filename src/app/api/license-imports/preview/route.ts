import { apiError, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { vistaPreviaDeImportacion } from "@/server/autodesk-import";
import { leerFormularioDeImportacion } from "@/server/autodesk-import-form";

export const dynamic = "force-dynamic";

/**
 * 0089 — Vista previa de un archivo de Autodesk: el equipo, el programa de cada
 * oferta y cuántos casos saldrían. No escribe nada. `licencias.gestionar`: es el
 * primer paso de importar. Las personas del detalle solo viajan con `contactos.ver`.
 */
export const POST = requireCapability("licencias.gestionar", async (session, req: Request) => {
  const form = await leerFormularioDeImportacion(req);
  if (!form.ok) return form.response;
  const r = await vistaPreviaDeImportacion(session.organizationId, {
    nombre: form.data.nombre,
    bytes: form.data.bytes,
    teamId: form.data.teamId,
    mapeo: form.data.mapeo,
    conDetalle: sessionCapabilities(session).includes("contactos.ver"),
  });
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ vistaPrevia: r.data });
});
