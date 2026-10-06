import { z } from "zod";
import { apiError, parseBody, requireCapability } from "@/lib/api";
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

const bodySchema = z.object({
  /**
   * 2026-10-05 — Reinvitar aunque ya tenga acceso: genera una contraseña
   * temporal nueva y la anterior deja de servir. La pantalla lo pide recién
   * después de que alguien lo confirma.
   */
  force: z.boolean().optional(),
});

/**
 * 012 (T017, DV-004/DV-008) — Habilita el portal de UN alumno y le avisa.
 *
 * La versión masiva (2026-10-05, T017b revertido) vive en
 * `/api/cohorts/:id/access/bulk`; esta ruta sigue identificando a UNA persona
 * por la inscripción de la URL.
 *
 * Sin body —o con `{}`— y con acceso ya dado, NO reinvita: responde 200 con
 * `skipped: true` y la fecha del último correo de acceso, para que la
 * pantalla pregunte antes. Con `{ "force": true }` reinvita.
 *
 * La contraseña temporal la genera el servidor —no la elige quien invita— y
 * viaja en la respuesta UNA vez, para que el staff pueda dictarla si el
 * correo demora.
 */
export const POST = requireCapability(
  "accesos.gestionar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;

    // El body es opcional: los llamados de siempre (POST sin body) siguen
    // valiendo, y significan "sin forzar".
    const raw = await req.text();
    let force = false;
    if (raw.trim()) {
      const body = await parseBody(new Request(req.url, { method: "POST", body: raw }), bodySchema);
      if (!body.ok) return body.response;
      force = body.data.force ?? false;
    }

    const result = await grantPortalAccess(session.organizationId, id, {
      force,
      sentBy: session.userId,
    });
    if (!result.ok) return apiError(result.status, result.code, result.message);
    if (result.data.skipped) return Response.json(result.data);
    return Response.json(result.data, { status: 201 });
  }
);
