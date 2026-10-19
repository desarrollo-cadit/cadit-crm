import { apiError, parseBody, requireCapability } from "@/lib/api";
import { companyCreateSchema } from "@/lib/company";
import { createCompany, listCompanies, serializeCompany } from "@/server/companies";

export const dynamic = "force-dynamic";

export const GET = requireCapability(
  "contactos.ver",
  async (session) => {
  const rows = await listCompanies(session.organizationId);
  return Response.json({ companies: rows.map(serializeCompany) });
});

/**
 * 040 (FR-005, DV-003) — `empresas.editar`, ya no `contactos.editar`.
 *
 * Lo crean Ventas, Coordinación, Dirección y Administración. Soporte deja de
 * poder crear empresas por la API (no tenía forma de hacerlo desde la
 * pantalla: el alta inline vive en el formulario de inscripción, que exige
 * `inscripciones.editar`). RUT repetido en la organización → 409.
 */
export const POST = requireCapability(
  "empresas.editar",
  async (session, req: Request) => {
    const body = await parseBody(req, companyCreateSchema);
    if (!body.ok) return body.response;

    const result = await createCompany(session.organizationId, body.data);
    if (!result.ok) return apiError(result.status, result.code, result.message);
    return Response.json({ company: result.company }, { status: 201 });
  }
);
