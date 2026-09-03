import { apiError, requireCapability } from "@/lib/api";
import { grantTeacherPortalAccess } from "@/server/access";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 014 (T009, DV-006) — Habilita el portal de UN profesor.
 *
 * `accesos.gestionar` y no `academico.editar`: dar la llave de una cuenta no
 * es la misma tarea que editar la ficha del docente, aunque se haga en la
 * misma pantalla. Mismo criterio que la invitación de alumnos en 012.
 *
 * **No existe la versión masiva y no se va a construir.** Son 7 personas y un
 * correo no se puede desenviar. Igual que con los 340 alumnos.
 */
export const POST = requireCapability(
  "accesos.gestionar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await grantTeacherPortalAccess(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data, { status: 201 });
  }
);
