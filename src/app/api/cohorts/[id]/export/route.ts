import { apiError, requireCapability } from "@/lib/api";
import { exportCohortRosterCsv } from "@/server/enrollments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Iteración 6 (feedback en vivo: "exportar en formato csv los alumnos de esa
 * cohorte, solo nombre apellido y correo") — accesible por cualquier rol
 * autenticado, igual que el roster; el CSV en sí ya excluye todo dato
 * financiero (exportCohortRosterCsv no lo selecciona).
 */
export const GET = requireCapability(
  "inscripciones.ver",
  async (session, _req: Request, ctx: Params) => {
  const { id } = await ctx.params;
  const csv = await exportCohortRosterCsv(session.organizationId, id);
  if (csv === null) return apiError(404, "not_found", "Cohorte no encontrada");
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="cohorte-${id}.csv"`,
    },
  });
});
