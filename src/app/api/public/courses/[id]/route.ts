import { apiError } from "@/lib/api";
import { getPublicCourse } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** 005 (T043, US7, contracts/public-courses.md) — sin `withAuth`, 404 si no existe. */
export async function GET(_req: Request, ctx: Params) {
  const { id } = await ctx.params;
  const course = await getPublicCourse(id);
  if (!course) return apiError(404, "not_found", "Curso no encontrado");
  return Response.json(
    { course },
    { headers: { "Cache-Control": "public, max-age=60" } }
  );
}
