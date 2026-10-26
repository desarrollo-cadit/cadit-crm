import { apiError, parseBody, requireCapability } from "@/lib/api";
import { unificarBodySchema } from "@/lib/contact-merge";
import { aplicarUnificacion, prepararUnificacion } from "@/server/contact-merge";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-10-26 — Unificar dos contactos. IRREVERSIBLE: el absorbido se borra.
 *
 * Todo se vuelve a validar acá, dentro de la transacción del pedido, sobre
 * los dos contactos BLOQUEADOS (`prepararUnificacion` lee con `for update`):
 * lo que mostró la vista previa puede haber cambiado. Un bloqueo se responde
 * ANTES de escribir nada. Si algo falla durante las escrituras,
 * `aplicarUnificacion` LANZA y la transacción revierte entera: nunca queda
 * una unificación a medias (un 23505 de una carrera vuelve como 409).
 */
export const POST = requireCapability(
  "contactos.unificar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, unificarBodySchema);
    if (!body.ok) return body.response;
    if (body.data.withId === id) {
      return apiError(422, "mismo_contacto", "Elegí otro contacto: no se puede unificar un contacto consigo mismo.");
    }
    const prep = await prepararUnificacion(session.organizationId, id, body.data.withId, {
      quienQueda: body.data.keepId ?? null,
      correos: body.data.emails ?? null,
    });
    if (!prep) return apiError(404, "not_found", "Contacto no encontrado");
    const { plan } = prep;
    if (plan.bloqueos.length > 0) {
      return Response.json(
        {
          error: {
            code: "bloqueado",
            message: plan.bloqueos.map((b) => b.mensaje).join(" "),
            bloqueos: plan.bloqueos,
          },
        },
        { status: 409 }
      );
    }
    if (plan.correos.faltaElegir) {
      return apiError(422, "elegir_correos", "Entre los dos hay más de dos correos: elegí cuáles quedan.");
    }
    if (plan.correos.error) return apiError(422, "correos_invalidos", plan.correos.error);

    const survivorId = await aplicarUnificacion(session.organizationId, session.userId, plan);
    return Response.json({ survivorId, nota: plan.nota });
  }
);
