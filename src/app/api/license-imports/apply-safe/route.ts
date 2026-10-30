import { apiError, parseBody, requireCapability } from "@/lib/api";
import { aplicarLoSeguroSchema } from "@/lib/autodesk-import/body";
import { aplicarLoSeguro } from "@/server/autodesk-import";

export const dynamic = "force-dynamic";

/**
 * 0091 — «Aplicar lo seguro» de un equipo: solo lo que no tiene dos lecturas
 * (asignar a quien tiene un único curso en marcha o a un profesor, pasar de
 * equipo una licencia individual, desmarcar lo que ya terminó). Con
 * `soloContar` no escribe: dice cuántas aplicaría. Idempotente.
 * `licencias.gestionar`.
 */
export const POST = requireCapability("licencias.gestionar", async (session, req: Request) => {
  const body = await parseBody(req, aplicarLoSeguroSchema);
  if (!body.ok) return body.response;
  const r = await aplicarLoSeguro(session.organizationId, session.userId, body.data.teamId, {
    soloContar: body.data.soloContar,
  });
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ resultado: r.data });
});
