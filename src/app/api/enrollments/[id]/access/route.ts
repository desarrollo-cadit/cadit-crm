import { apiError, requireCapability } from "@/lib/api";
import { grantPortalAccess, portalAccessState } from "@/server/access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 012 (T017) — Estado del acceso al portal del alumno de esta inscripción.
 *
 * `accesos.gestionar` y no `inscripciones.ver`: dar o quitar la llave de una
 * cuenta no es la misma tarea que ver un legajo, aunque se haga en la misma
 * pantalla.
 */
export const GET = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await portalAccessState(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data);
  }
);

/**
 * 012 (T017, DV-004/DV-008) — Habilita el portal de UN alumno y le avisa.
 *
 * **No existe la versión masiva y no se va a construir (T017b.)** El dueño
 * pidió expresamente que a los 340 alumnos actuales no les llegue nada
 * todavía. Un endpoint que invite a toda la cohorte es un botón esperando que
 * alguien lo apriete, y un correo no se puede desenviar.
 *
 * Sin body: la ruta identifica al alumno por la inscripción. La contraseña
 * temporal la genera el servidor —no la elige quien invita— y viaja en la
 * respuesta UNA vez, para que el staff pueda dictarla si el correo demora.
 */
export const POST = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await grantPortalAccess(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data, { status: 201 });
  }
);
