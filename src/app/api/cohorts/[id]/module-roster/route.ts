import { apiError, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { rosterDeModulo } from "@/server/module-roster";
import { correosDeLicenciaPorInscripcion } from "@/server/licenses";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 034 (US4, FR-017) — La lista de alumnos de un MÓDULO: quién lo cursa, con
 * su asistencia, su estado y sus licencias del módulo. Sin datos comerciales,
 * sin acceso al portal y sin teléfono: no se consultan.
 *
 * `academico.ver`, como `/api/cohorts/[id]/program`: es la ficha académica
 * del módulo. Una cohorte que no es módulo responde 404.
 *
 * 2026-10-21 — El correo de la licencia se suma ACÁ, y solo con
 * `contactos.ver`: sin ella no se consulta. `rosterDeModulo` sigue sin nombrar
 * columnas de contacto.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const roster = await rosterDeModulo(session.organizationId, id);
    if (!roster) return apiError(404, "not_found", "Módulo no encontrado");
    if (!sessionCapabilities(session).includes("contactos.ver")) return Response.json(roster);

    const correos = await correosDeLicenciaPorInscripcion(
      session.organizationId,
      roster.students.map((s) => s.enrollmentId)
    );
    return Response.json({
      ...roster,
      students: roster.students.map((s) => ({
        ...s,
        licenseEmail: correos.get(s.enrollmentId) ?? { email: null, distinto: false, propio: null },
      })),
    });
  }
);
