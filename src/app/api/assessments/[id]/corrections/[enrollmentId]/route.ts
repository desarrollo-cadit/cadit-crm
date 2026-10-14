import { apiError, parseBody, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { correctionInputSchema } from "@/lib/grading-template";
import { guardarCorreccion, leerCorreccion } from "@/server/corrections";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; enrollmentId: string }> };

/**
 * 031 (T019, DV-014) — La corrección de UN alumno, desde el panel del STAFF.
 *
 * `evaluacion.editar` para corregir; si además puede PUBLICAR una evaluación
 * con aprobación lo dice `correcciones.aprobar`, y eso se pregunta acá, en la
 * ruta, porque es lo único que sabe de la sesión. El módulo recibe un booleano
 * y no un rol: así una ruta nueva no puede "olvidarse" de la regla sin que se
 * note en su firma.
 *
 * Una inscripción de otra cohorte responde 404, igual que una inexistente.
 */
export const GET = requireCapability(
  "evaluacion.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id, enrollmentId } = await ctx.params;
    const data = await leerCorreccion(
      session.organizationId,
      id,
      enrollmentId,
      sessionCapabilities(session).includes("correcciones.aprobar")
    );
    if (!data) return apiError(404, "not_found", "Evaluación o alumno no encontrado");
    return Response.json(data);
  }
);

export const PUT = requireCapability(
  "evaluacion.editar",
  async (session, req: Request, ctx: Params) => {
    const { id, enrollmentId } = await ctx.params;
    const body = await parseBody(req, correctionInputSchema);
    if (!body.ok) return body.response;

    const r = await guardarCorreccion(
      session.organizationId,
      id,
      enrollmentId,
      session.userId,
      body.data,
      sessionCapabilities(session).includes("correcciones.aprobar")
    );
    if (!r.ok) return apiError(r.status, r.code, r.message);
    return Response.json({ correction: r.data });
  }
);
