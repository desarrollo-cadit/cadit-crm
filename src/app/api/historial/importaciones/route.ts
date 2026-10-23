import { apiError, parseBody, requireCapability } from "@/lib/api";
import { crearImportacionBodySchema } from "@/lib/historial-import/body";
import { crearImportacion, listarImportaciones } from "@/server/historial-import";

export const dynamic = "force-dynamic";

/** 046 US6 (FR-020) — Las importaciones hechas, más reciente primero. */
export const GET = requireCapability("historial.importar", async (session) =>
  Response.json({ importaciones: await listarImportaciones(session.organizationId) })
);

/**
 * 046 US6 (FR-020) — Paso 3: confirma. Guarda las filas válidas y el mapeo;
 * las tandas se aplican con `POST …/[id]/aplicar`.
 */
export const POST = requireCapability("historial.importar", async (session, req: Request) => {
  const body = await parseBody(req, crearImportacionBodySchema);
  if (!body.ok) return body.response;
  const r = await crearImportacion(session.organizationId, session.userId, body.data);
  if (!r.ok) return apiError(422, r.code, r.message);
  return Response.json(r.importacion, { status: 201 });
});
