import { apiError, parseBody, requireCapability } from "@/lib/api";
import { vistaPreviaBodySchema } from "@/lib/historial-import/body";
import { vistaPrevia } from "@/server/historial-import";

export const dynamic = "force-dynamic";

/**
 * 046 US6 (FR-016) — Paso 2: cuántos contactos se crean, completan o quedan
 * igual, cuántas empresas y cursadas se crean. No escribe nada.
 */
export const POST = requireCapability("historial.importar", async (session, req: Request) => {
  const body = await parseBody(req, vistaPreviaBodySchema);
  if (!body.ok) return body.response;
  const r = await vistaPrevia(session.organizationId, body.data.csv, body.data.mapeo);
  if (!r.ok) return apiError(422, r.code, r.message);
  return Response.json(r.vista);
});
