import { apiError, requireCapability } from "@/lib/api";
import { estadosDeAccesoDeContacto } from "@/server/access-expiry";
import { contactGrants } from "@/server/offline-courses/grants";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 043 — El acceso a contenidos de una persona, para su legajo: hasta cuándo
 * ve cada cursada (calculado o fijado a mano) y sus accesos directos a cursos
 * offline (vigentes, vencidos y quitados).
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const grants = await contactGrants(session.organizationId, id);
    if (!grants) return apiError(404, "not_found", "Contacto no encontrado");
    const estados = await estadosDeAccesoDeContacto(session.organizationId, id);
    return Response.json({
      enrollments: [...estados.entries()].map(([enrollmentId, e]) => ({ enrollmentId, ...e })),
      grants,
    });
  }
);
