import { apiError, withOrganization } from "@/lib/api";
import { imagenPorToken } from "@/server/marketing/images";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ token: string }> };

const noEncontrada = () => apiError(404, "not_found", "Imagen no encontrada");

/**
 * 045 (FR-007b, DV-013) — Imagen de una campaña, para el `<img>` del correo.
 * Sin sesión: la abre cualquiera que reciba el correo. El token es aleatorio
 * de 256 bits; otra forma no toca la base. Ausencia = 404 neutro, nunca 403.
 */
export const GET = withOrganization(
  "public:marketing-imagen",
  async (_req: Request, _ctx: Params) => resolveSoleOrganizationId(),
  noEncontrada,
  async (organizationId: string, _req: Request, ctx: Params) => {
    const { token } = await ctx.params;
    const image = await imagenPorToken(organizationId, token);
    if (!image) return noEncontrada();
    return new Response(new Uint8Array(image.data), {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
        "content-disposition": "inline",
      },
    });
  }
);
