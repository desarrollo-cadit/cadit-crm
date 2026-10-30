import { apiError, parseBody, requireCapability } from "@/lib/api";
import { companyCreateSchema } from "@/lib/company";
import {
  contarPersonasPorEmpresa,
  createCompany,
  listCompanies,
  serializeCompany,
} from "@/server/companies";

export const dynamic = "force-dynamic";

export const GET = requireCapability(
  "contactos.ver",
  async (session) => {
  const [rows, personas] = await Promise.all([
    listCompanies(session.organizationId),
    contarPersonasPorEmpresa(session.organizationId),
  ]);
  // 2026-10-30 — `peopleCount` se suma al DTO de siempre: un conteo, sin datos de nadie.
  return Response.json({
    companies: rows.map((c) => ({ ...serializeCompany(c), peopleCount: personas.get(c.id) ?? 0 })),
  });
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
