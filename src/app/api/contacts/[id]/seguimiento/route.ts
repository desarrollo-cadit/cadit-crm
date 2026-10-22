import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { seguimientoBodySchema } from "@/lib/seguimiento";
import { registrarActividad, seguimientoDelContacto } from "@/server/seguimiento";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * La pestaña «Seguimiento» del contacto: cada formulario que mandó, las notas
 * del equipo y cada vez que alguien le escribió, en una sola línea.
 *
 * Leer pide `contactos.ver` (lo mismo que el legajo: el correo y el teléfono
 * ya viajan en su encabezado). Escribir —una nota, o «le escribí por correo /
 * WhatsApp»— pide `inscripciones.seguimiento`, la capacidad del seguimiento de
 * ventas. Un contacto ajeno o inexistente es 404, igual que en el legajo.
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await seguimientoDelContacto(session.organizationId, id, {
      // 045 — reactivar los correos de marketing es de quien configura marketing.
      puedeReactivarMarketing: sessionCapabilities(session).includes("marketing.configurar"),
    });
    if (!data) return apiError(404, "not_found", "Contacto no encontrado");
    return Response.json(data);
  }
);

export const POST = requireCapability(
  "inscripciones.seguimiento",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, seguimientoBodySchema);
    if (!body.ok) return body.response;
    const actividad = await registrarActividad(session.organizationId, id, session.userId, body.data);
    if (!actividad) return apiError(404, "not_found", "Contacto no encontrado");
    return Response.json({ activity: actividad }, { status: 201 });
  }
);
