import { z } from "zod";
import { parseBody, requireCapability } from "@/lib/api";
import { createCompany, listCompanies, serializeCompany } from "@/server/companies";

export const dynamic = "force-dynamic";

export const GET = requireCapability(
  "contactos.ver",
  async (session) => {
  const rows = await listCompanies(session.organizationId);
  return Response.json({ companies: rows.map(serializeCompany) });
});

const createSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  taxId: z.string().trim().max(60).optional(),
});

export const POST = requireCapability(
  "contactos.editar",
  async (session, req: Request) => {
  const body = await parseBody(req, createSchema);
  if (!body.ok) return body.response;

  const id = await createCompany(session.organizationId, {
    legalName: body.data.legalName,
    taxId: body.data.taxId ?? null,
  });
  return Response.json(
    { company: { id, legalName: body.data.legalName, taxId: body.data.taxId ?? null } },
    { status: 201 }
  );
});
