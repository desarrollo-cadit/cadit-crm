import { apiError, parseBody, requireCapability } from "@/lib/api";
import { companyPatchSchema } from "@/lib/company";
import { updateCompany } from "@/server/companies";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * 040 (FR-005) — Editar los datos de una empresa. Lo que no viene se
 * conserva; `null` o vacío borra. 404 si la empresa no es de la organización;
 * 409 si el RUT nuevo ya lo tiene otra empresa.
 */
export const PATCH = requireCapability(
  "empresas.editar",
  async (session, req: Request, ctx: Params) => {
    const { id } = await ctx.params;
    const body = await parseBody(req, companyPatchSchema);
    if (!body.ok) return body.response;

    const result = await updateCompany(session.organizationId, id, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ company: result.company });
  }
);
