import { apiError, requireCapability } from "@/lib/api";
import { rosterDeModulo } from "@/server/module-roster";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 034 (US4, FR-017) — La lista de alumnos de un MÓDULO: quién lo cursa, con
 * su asistencia, su estado y sus licencias del módulo. Sin datos comerciales,
 * sin acceso al portal y sin teléfono: no se consultan.
 *
 * `academico.ver`, como `/api/cohorts/[id]/program`: es la ficha académica
 * del módulo. Una cohorte que no es módulo responde 404.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const roster = await rosterDeModulo(session.organizationId, id);
    if (!roster) return apiError(404, "not_found", "Módulo no encontrado");
    return Response.json(roster);
  }
);
