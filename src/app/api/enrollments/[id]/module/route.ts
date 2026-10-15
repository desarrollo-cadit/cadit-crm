import { apiError, requireCapability } from "@/lib/api";
import { sacarDeModulo } from "@/server/module-enrollment";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 034 (US1 escenario 6, FR-004) — Sacar a una persona de UN módulo.
 *
 * `[id]` es la inscripción HIJA. Se borra sólo si no tiene historia
 * (asistencia, notas, entregas, certificado, cuotas) y queda registrado que no
 * cursa ese módulo, para que la regularización no la vuelva a inscribir. La
 * madre y los otros módulos no se tocan.
 *
 * `inscripciones.editar`, la misma capacidad que crea esa inscripción.
 */
export const DELETE = requireCapability(
  "inscripciones.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await sacarDeModulo(session.organizationId, id, session.userId);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ removed: true, licensesReleased: result.licenciasLiberadas });
  }
);
