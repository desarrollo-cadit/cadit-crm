import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
import { bulkSendOverview, startBulkSend } from "@/server/bulk-sends";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-10-05 — Envío masivo de los correos de inscripción (términos ATC y
 * bienvenida al grupo) a los alumnos de la cohorte.
 *
 * `inscripciones.ver`, la MISMA capacidad que el envío individual
 * (`/api/enrollments/:id/emails`): mandárselo a todos no es otra tarea que
 * mandárselo a uno. El acceso al portal tiene su propia ruta y su propia
 * capacidad (`/api/cohorts/:id/access/bulk`).
 */
export const GET = requireCapability(
  "inscripciones.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const overview = await bulkSendOverview(session.organizationId, id, ["terms", "welcome"]);
    if (!overview) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json({ kinds: overview });
  }
);

const bodySchema = z.object({
  kind: z.enum(["terms", "welcome"], {
    message: "Elegí qué correo enviar: términos de la licencia o bienvenida.",
  }),
});

/**
 * Arranca la corrida y responde enseguida (202): el envío sigue en segundo
 * plano, de a uno y con pausa. La pantalla consulta el avance en
 * `/api/cohorts/:id/emails/bulk/:runId`.
 */
export const POST = requireCapability(
  "inscripciones.ver",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, bodySchema);
    if (!body.ok) return body.response;

    const result = await startBulkSend(session.organizationId, id, body.data.kind, session.userId);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data, { status: 202 });
  }
);
