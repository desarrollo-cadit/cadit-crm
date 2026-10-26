import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { vistaPrevia, vistaPreviaQuerySchema } from "@/lib/contact-merge";
import { prepararUnificacion } from "@/server/contact-merge";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-10-26 — Vista previa de "Unificar contactos". Unificar es
 * irreversible, así que la pantalla SIEMPRE pasa por acá antes: quién queda,
 * cómo queda cada dato, qué se mueve y qué bloquea. Es la MISMA función que
 * usa la unificación (`planDeUnificacion`); acá no se escribe nada.
 *
 * Contacto ajeno o inexistente (cualquiera de los dos): 404.
 */
export const GET = requireCapability(
  "contactos.unificar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), vistaPreviaQuerySchema);
    if (!query.ok) return query.response;
    if (query.data.with === id) {
      return apiError(422, "mismo_contacto", "Elegí otro contacto: no se puede unificar un contacto consigo mismo.");
    }
    const prep = await prepararUnificacion(session.organizationId, id, query.data.with, {
      quienQueda: query.data.keep ?? null,
      correos: query.data.primary
        ? { primary: query.data.primary, secondary: query.data.secondary ?? null }
        : null,
    });
    if (!prep) return apiError(404, "not_found", "Contacto no encontrado");
    return Response.json({ preview: vistaPrevia(prep.a, prep.b, prep.plan) });
  }
);
