import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { createCourseCategory, listCourseCategories } from "@/server/course-content";

export const dynamic = "force-dynamic";

/**
 * 006 — Categorías del catálogo. Accesible a cualquier rol autenticado: es
 * información de catálogo, no financiera (mismo criterio que `/api/courses`).
 */
export const GET = requireCapability(
  "academico.ver",
  async (session) => {
  const categories = await listCourseCategories(session.organizationId);
  return Response.json({ categories });
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(140).optional(),
});

export const POST = requireCapability(
  "academico.editar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const category = await createCourseCategory(session.organizationId, body.data);
  return Response.json({ category }, { status: 201 });
});
