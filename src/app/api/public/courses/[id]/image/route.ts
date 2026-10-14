import { apiError, withOrganization } from "@/lib/api";
import { readCourseImage } from "@/server/course-image";
import { resolveSoleOrganizationId } from "@/server/public-catalog";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Portada del curso para el sitio comercial (va en un `<img>`, sin CORS).
 * Sin sesión pero con alcance, como el resto del catálogo público. La URL
 * lleva `?v=` que cambia con cada subida, así que se puede cachear largo.
 */
export const GET = withOrganization(
  "public:curso-imagen",
  async (_req: Request, _ctx: Params) => resolveSoleOrganizationId(),
  () => apiError(404, "not_found", "Imagen no encontrada"),
  async (organizationId: string, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const image = await readCourseImage(organizationId, id);
    if (!image) return apiError(404, "not_found", "Imagen no encontrada");
    return new Response(new Uint8Array(image.data), {
      headers: {
        "content-type": image.mimeType,
        "cache-control": "public, max-age=31536000, immutable",
        "x-content-type-options": "nosniff",
      },
    });
  }
);
