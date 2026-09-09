import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { deleteCourseCategory, updateCourseCategory } from "@/server/course-content";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  slug: z.string().trim().min(1).max(140).optional(),
});

export const PATCH = requireCapability(
  "academico.editar",
  async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const category = await updateCourseCategory(session.organizationId, id, body.data);
  if (!category) return apiError(404, "not_found", "Categoría no encontrada");
  return Response.json({ category });
});

/** Los cursos que la usaban quedan sin categoría (ON DELETE SET NULL). */
export const DELETE = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const deleted = await deleteCourseCategory(session.organizationId, id);
  if (!deleted) return apiError(404, "not_found", "Categoría no encontrada");
  return Response.json({ ok: true });
});
