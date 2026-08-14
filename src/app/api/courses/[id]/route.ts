import { z } from "zod";
import { apiError, parseBody, withAuth } from "@/lib/api";
import {
  courseContentSchema,
  getCourse,
  updateCourseWithModules,
} from "@/server/courses";
import { courseModulesSchema, listCourseModules } from "@/server/course-content";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  ...courseContentSchema,
  /**
   * 006 — temario completo. Se manda entero y no módulo por módulo porque el
   * editor lo manipula como una lista (agregar/borrar/reordenar en la misma
   * pantalla); omitirlo deja el temario existente intacto.
   */
  modules: courseModulesSchema.optional(),
});

/** Editar un curso: datos básicos + ficha comercial + temario (006). */
export const PATCH = withAuth(async (session, req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);
  if (!body.ok) return body.response;

  const { modules, ...courseFields } = body.data;

  const result = await updateCourseWithModules(
    session.organizationId,
    id,
    courseFields,
    modules
  );
  if (!result.ok) return apiError(result.status, result.code, result.message);

  return Response.json({
    course: result.course,
    modules: await listCourseModules(session.organizationId, id),
  });
});

/** 006 — el editor precarga el curso junto con su temario. */
export const GET = withAuth(async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const course = await getCourse(session.organizationId, id);
  if (!course) return apiError(404, "not_found", "Curso no encontrado");
  return Response.json({
    course,
    modules: await listCourseModules(session.organizationId, id),
  });
});
