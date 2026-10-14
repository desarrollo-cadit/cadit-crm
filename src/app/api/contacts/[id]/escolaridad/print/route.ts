import { apiError, requireCapability } from "@/lib/api";
import { renderEscolaridadHtml } from "@/lib/escolaridad";
import { escolaridadDeContacto } from "@/server/transcript";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 031 (T039, DV-011) — La escolaridad de un alumno, desde el legajo del STAFF.
 *
 * HTML A4 vertical para "Imprimir → Guardar como PDF", el mismo patrón que el
 * certificado. `academico.ver` y no `contactos.ver`: es un documento de la
 * cursada, y no lleva nada de contacto ni de cobranza que lo justifique.
 *
 * Un contacto ajeno o sin cursadas responde 404: del lado del staff no hay
 * nada que imprimir, y un papel vacío con membrete se entrega por error.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const r = await escolaridadDeContacto(session.organizationId, id);
    if (!r || r.escolaridad.cursadas.length === 0) {
      return apiError(404, "not_found", "Este alumno no tiene cursadas para la escolaridad");
    }
    return new Response(renderEscolaridadHtml(r.escolaridad, r.timezone), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
);
