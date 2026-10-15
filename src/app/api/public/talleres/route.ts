import { withOrganization } from "@/lib/api";
import { corsPreflight, withCors } from "@/lib/cors";
import { resolveSoleOrganizationId } from "@/server/public-catalog";
import { listPublicWorkshops } from "@/server/workshops";

export const dynamic = "force-dynamic";

/** 033 — preflight: la web consume los talleres desde otro dominio. */
export function OPTIONS(req: Request) {
  return corsPreflight(req);
}

/**
 * 033 (FR-005) — Los talleres abiertos y próximos, para la web de la
 * academia. Sin sesión pero CON alcance (`withOrganization`), igual que el
 * catálogo de cursos: sin `app.current_org` RLS devolvería cero filas en
 * silencio.
 *
 * Nunca viaja el enlace de la reunión ni nada de los inscriptos: el DTO lo
 * arma `toPublicWorkshop`, campo por campo.
 */
export const GET = withOrganization(
  "public:talleres",
  async (_req: Request) => resolveSoleOrganizationId(),
  () =>
    Response.json(
      { error: { code: "no_organization", message: "Talleres no disponibles" } },
      { status: 503 }
    ),
  async (organizationId, req: Request) => {
    const workshops = await listPublicWorkshops(organizationId);
    return withCors(
      req,
      // Cache corto: los lugares que quedan cambian con cada inscripción.
      Response.json({ workshops }, { headers: { "Cache-Control": "public, max-age=30" } })
    );
  }
);
