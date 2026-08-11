import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import { updateCourse } from "@/server/courses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(4000).nullable().optional(),
});

/** Editar nombre/descripción de un curso (feedback en vivo: faltaba esta vía). */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const course = await updateCourse(session.organizationId, id, body.data);
  if (!course) return apiError(404, "not_found", "Curso no encontrado");

  return Response.json({ course });
});
