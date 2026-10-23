import { z } from "zod";
import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { exportCohortRosterCsv } from "@/server/enrollments";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const querySchema = z.object({
  /**
   * 2026-10-23 — `licenciamiento`: solo quien necesita una licencia prestada,
   * con el correo de la licencia. Sin el parámetro, la exportación común.
   */
  variante: z.enum(["comun", "licenciamiento"]).optional(),
});

/**
 * Iteración 6 (feedback en vivo: "exportar en formato csv los alumnos de esa
 * cohorte, solo nombre apellido y correo") — accesible por cualquier rol
 * autenticado, igual que el roster; el CSV en sí ya excluye todo dato
 * financiero (exportCohortRosterCsv no lo selecciona).
 *
 * La variante de licenciamiento pide la MISMA capacidad: el correo de la
 * licencia ya viaja en el roster a quien ve el correo del alumno.
 */
export const GET = requireCapability(
  "inscripciones.ver",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), querySchema);
    if (!query.ok) return query.response;
    const variante = query.data.variante ?? "comun";
    const csv = await exportCohortRosterCsv(session.organizationId, id, variante);
    if (csv === null) return apiError(404, "not_found", "Grupo no encontrado");
    const sufijo = variante === "licenciamiento" ? "-licenciamiento" : "";
    return new Response(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="grupo-${id}${sufijo}.csv"`,
      },
    });
  }
);
