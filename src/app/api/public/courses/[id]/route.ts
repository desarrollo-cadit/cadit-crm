import { apiError, withOrganization } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { getPublicCourse, resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

/** 007 — preflight: el sitio comercial consume el detalle desde otro dominio. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

type Params = { params: Promise<{ id: string }> };

/**
 * 005 (T043, US7, contracts/public-courses.md) — sin `withAuth`, 404 si no
 * existe. 006: el segmento acepta el `slug` público (`/cursos/ai-automation`)
 * además del id interno, sin cambiar la forma de la ruta.
 */
/**
 * 012 (T028, CORREGIDO 2026-09-01) — Sin sesión, pero CON alcance.
 *
 * Al encender RLS la app pasó a conectarse con un rol sujeto a las políticas,
 * y esta ruta corría sin declarar `app.current_org`: la base le devolvía cero
 * filas en silencio. "Sin sesión" nunca quiso decir "sin alcance".
 */
export const GET = withOrganization(
  "public:curso",
  async (_req: Request, _ctx: Params) => resolveSoleOrganizationId(),
  () =>
    Response.json(
      { error: { code: "no_organization", message: "Catálogo no disponible" } },
      { status: 503 }
    ),
  async (_organizationId: string, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const course = await getPublicCourse(id);
    if (!course) return withCors(req, apiError(404, "not_found", "Curso no encontrado"));
    return withCors(
      req,
      Response.json({ course }, { headers: { "Cache-Control": "public, max-age=60" } })
    );
  }
);
