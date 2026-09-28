import { apiError, requireCapability } from "@/lib/api";
import { generateProgramSchedule } from "@/server/attendance";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 029 — "Generar cronograma de todos los módulos", desde la especialización.
 *
 * UN pedido: el servidor genera cada módulo que todavía no tiene clases en un
 * solo insert, dentro de la transacción de `withAuth` (o entran todas o
 * ninguna), y devuelve qué módulos salteó y por qué. Los que ya tienen
 * cronograma no se tocan: regenerar duplicaría clases (constitución IV).
 *
 * `academico.editar`, igual que `POST /api/cohorts/[id]/schedule`: es la
 * misma acción, hecha para varios módulos a la vez.
 */
export const POST = requireCapability(
  "academico.editar",
  async (session, _req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const result = await generateProgramSchedule(session.organizationId, id);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json(result.data, { status: 201 });
  }
);
