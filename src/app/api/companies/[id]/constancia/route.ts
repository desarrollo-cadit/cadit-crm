import { z } from "zod";
import { apiError, parseQuery, requireCapability } from "@/lib/api";
import { corteSchema } from "@/lib/constancia-empresa";
import { constanciaPdf } from "@/server/constancia-empresa";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const querySchema = z.object({
  /** Sin grupo = la constancia GENERAL (todos los grupos de la empresa). */
  cohortId: z.string().trim().min(1).max(64).optional(),
  /** Fecha de corte; por defecto, hoy en la zona de la academia. */
  corte: corteSchema.optional(),
});

/**
 * 2026-10-29 — La constancia en PDF para una empresa.
 *
 * `contactos.ver`, la misma capacidad que el reporte por empresa
 * (`/api/companies/[id]/report`): es avance académico de personas, sin plata.
 * 404 si la empresa es de otra organización o si ese grupo no tiene alumnos
 * facturados a la empresa.
 */
export const GET = requireCapability(
  "contactos.ver",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const query = parseQuery(new URL(req.url), querySchema);
    if (!query.ok) return query.response;

    const pdf = await constanciaPdf(session.organizationId, id, {
      cohortId: query.data.cohortId ?? null,
      corte: query.data.corte ?? null,
    });
    if (!pdf) return apiError(404, "not_found", "No hay alumnos de esta empresa para la constancia");

    return new Response(new Uint8Array(pdf.bytes), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${pdf.archivo.ascii}"; filename*=UTF-8''${pdf.archivo.utf8}`,
        "cache-control": "private, no-store",
      },
    });
  }
);
