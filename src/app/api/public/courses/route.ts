import { z } from "zod";
import { parseQuery, withOrganization } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import {
  listPublicCategories,
  listPublicCourses,
  resolveSoleOrganizationId,
} from "@/server/public-catalog";

export const dynamic = "force-dynamic";

/** 007 — preflight: el sitio comercial consume el catálogo desde otro dominio. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

const querySchema = z.object({
  /** 006 — filtro del catálogo por categoría, con el slug público. */
  categoria: z.string().min(1).optional(),
});

/**
 * 005 (T042, US7) — sin sesión: es la superficie pública del catálogo (FR-020).
 * Nunca requiere ni acepta `organizationId` (DV-010).
 *
 * 012 (T028, CORREGIDO 2026-09-01) — **pero sí declara su alcance.**
 *
 * Al encender RLS, la app pasó a conectarse con un rol SUJETO a las políticas.
 * Desde entonces esta ruta corría sin `app.current_org` y RLS le devolvía cero
 * filas — en silencio, con un 200 y una lista vacía indistinguible de "no hay
 * cursos". El sitio comercial mostró el catálogo vacío teniendo 21 cursos
 * publicados.
 *
 * `withOrganization` abre la transacción y declara la organización antes de
 * tocar nada. "Sin sesión" nunca quiso decir "sin alcance".
 */
export const GET = withOrganization(
  "public:catalogo",
  async (_req: Request) => resolveSoleOrganizationId(),
  // Sin organización única no hay catálogo que servir, y decirlo con un 503 es
  // honesto: el 200 con lista vacía es justamente lo que escondió el bug.
  () =>
    Response.json(
      { error: { code: "no_organization", message: "Catálogo no disponible" } },
      { status: 503 }
    ),
  async (_organizationId, req: Request) => {
    const query = parseQuery(new URL(req.url), querySchema);
    if (!query.ok) return withCors(req, query.response);

    const [courses, categories] = await Promise.all([
      listPublicCourses({ categorySlug: query.data.categoria }),
      listPublicCategories(),
    ]);

    return withCors(
      req,
      Response.json(
        { courses, categories },
        { headers: { "Cache-Control": "public, max-age=60" } }
      )
    );
  }
);
