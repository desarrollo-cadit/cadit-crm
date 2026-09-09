import { apiError, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { camadaDeEspecializacion } from "@/server/program-staff";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 028 fase 4 (US3, mitad staff) — La especialización, entera.
 *
 * `academico.ver` y no una capacidad financiera, por el mismo criterio que
 * `/api/cohorts/[id]/classes`: la estructura del programa —qué módulos hay, en
 * qué orden, quién los dicta y cómo va el cronograma— es la ficha académica de
 * la camada, y soporte la necesita tanto como coordinación.
 *
 * La **grilla de aprobación** es otra cosa y pide `evaluacion.ver`, igual que
 * `/api/cohorts/[id]/grading`. La regla se aplica en el servidor y se aplica
 * **no armando** la clave: esconder la grilla en la pantalla sería mandar por
 * la red el estado de cada persona a quien no puede verlo — el mismo error que
 * la 012 corrigió en el roster.
 *
 * Una camada suelta responde 200 con `modules: []`. No es un 404 porque la
 * camada existe: lo que no existe es el programa, y decirlo con una lista
 * vacía es lo que le permite a la pantalla no ofrecer la pestaña.
 */
export const GET = requireCapability(
  "academico.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const data = await camadaDeEspecializacion(
      session.organizationId,
      id,
      sessionCapabilities(session)
    );
    if (!data) return apiError(404, "not_found", "Cohorte no encontrada");
    return Response.json(data);
  }
);
