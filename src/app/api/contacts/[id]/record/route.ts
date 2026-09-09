import { apiError, requireCapability } from "@/lib/api";
import { sessionCapabilities } from "@/lib/capabilities";
import { getStudentRecord } from "@/server/student-record";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 013 (T028, US6/FR-009/FR-010) — El legajo de una persona.
 *
 * `contactos.ver` abre la puerta; lo que se ve ADENTRO depende de las demás
 * capacidades. El estado de cuenta solo viaja con `cobranza.ver`, y no se
 * filtra en la UI: `getStudentRecord` directamente no lo arma.
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const record = await getStudentRecord(
      session.organizationId,
      id,
      sessionCapabilities(session)
    );
    if (!record) return apiError(404, "not_found", "Contacto no encontrado");
    return Response.json(record);
  }
);
