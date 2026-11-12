import { apiError, parseBody, requireCapability } from "@/lib/api";
import { recordatorioBodySchema } from "@/lib/recordatorios";
import { crearRecordatorio, recordatoriosDelContacto } from "@/server/recordatorios";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Los recordatorios de seguimiento de un contacto. Leer pide `contactos.ver`
 * (como la pestaña «Seguimiento»); agendar pide `inscripciones.seguimiento`.
 * Un contacto ajeno o inexistente es 404.
 */
export const GET = requireCapability("contactos.ver", async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const data = await recordatoriosDelContacto(session.organizationId, id);
  if (!data) return apiError(404, "not_found", "Contacto no encontrado");
  return Response.json(data);
});

export const POST = requireCapability(
  "inscripciones.seguimiento",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, recordatorioBodySchema);
    if (!body.ok) return body.response;
    const r = await crearRecordatorio(session.organizationId, id, session.userId, body.data);
    if (!r.ok) {
      if (r.error === "fecha_en_el_pasado") {
        return apiError(422, "fecha_en_el_pasado", "La fecha no puede ser anterior a hoy");
      }
      return apiError(404, "not_found", "Contacto no encontrado");
    }
    return Response.json({ reminder: r.recordatorio }, { status: 201 });
  }
);
