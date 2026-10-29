import { apiError, parseBody, requireCapability } from "@/lib/api";
import { crearModelo, listarModelos, modeloInputSchema } from "@/server/course-assessment-templates";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 0084 — Las evaluaciones MODELO de un curso. Leerlas es contenido académico
 * (`academico.ver`); crearlas es edición del curso (`academico.editar`), la
 * misma capacidad que edita el curso y su material.
 */
export const GET = requireCapability("academico.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  return Response.json({ models: await listarModelos(session.organizationId, id) });
});

export const POST = requireCapability("academico.editar", async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, modeloInputSchema);
  if (!body.ok) return body.response;
  const r = await crearModelo(session.organizationId, id, body.data);
  if (!r.ok) return apiError(r.status, r.code, r.message);
  return Response.json({ model: r.data }, { status: 201 });
});
