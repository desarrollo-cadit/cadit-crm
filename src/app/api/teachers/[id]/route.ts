import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { getTeacher, updateTeacher } from "@/server/teachers";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const teacher = await getTeacher(session.organizationId, id);
  if (!teacher) return apiError(404, "not_found", "Profesor no encontrado");
  return Response.json({ teacher });
});

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  hourlyRate: z.number().int().min(0).nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional(),
  courseIds: z.array(z.string().min(1)).optional(),
});

/**
 * 005 iteración 2 — edita nombre/costo por hora y qué cursos dicta un
 * profesor (pestaña "Profesores" de /academico, feedback en vivo del dueño).
 */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const result = await updateTeacher(session.organizationId, id, body.data);
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({ teacher: result.teacher });
});
