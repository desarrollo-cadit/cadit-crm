import { apiError, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { getStudentAdminActivity } from "@/server/student-admin-activity";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 2026-10-07 — La pestaña «Administración» del legajo: ingresos al portal,
 * progreso en cursos offline, línea de tiempo y registro de actividad.
 *
 * Ruta PROPIA y no una clave más de `/record`: el legajo lo abre
 * `contactos.ver`, y esto exige `alumnos.auditoria`. Mezclarlos obligaría a
 * esconder IPs en la UI, que es habérselas mandado igual. Un contacto que no
 * es de esta organización es 404, igual que en el legajo.
 */
export const GET = requireCapability(
  "alumnos.auditoria",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await getStudentAdminActivity(
      session.organizationId,
      id,
      sessionCapabilities(session)
    );
    if (!data) return apiError(404, "not_found", "Contacto no encontrado");
    return Response.json(data);
  }
);
