import { z } from "zod";
import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { companyReport, exportCompanyReportCsv } from "@/server/company-report";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const querySchema = z.object({ format: z.enum(["json", "csv"]).optional() });

/**
 * 013 (T032, FR-010c) — Cómo van los empleados de una empresa.
 *
 * `contactos.ver`: es información de personas y su avance académico, no de
 * plata. **El reporte NO lleva montos** — lo que la empresa pagó es entre la
 * empresa y la academia, y no va en la misma planilla que las notas de sus
 * empleados.
 *
 * El CSV se pide con `?format=csv` en la misma ruta en vez de tener un
 * endpoint aparte: es la misma información, cambia el envase.
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), querySchema);
    if (!query.ok) return query.response;

    const report = await companyReport(session.organizationId, id);
    if (!report) return apiError(404, "not_found", "Empresa no encontrada");

    if (query.data.format !== "csv") return Response.json(report);

    const slug = report.company.name.replace(/[^\w-]+/g, "-").toLowerCase();
    return new Response(exportCompanyReportCsv(report), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="empleados-${slug}.csv"`,
      },
    });
  }
);
