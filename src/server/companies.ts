import { asc } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";

/** 005 (DV-009, FR-012) — Alta de una empresa para facturación B2B opcional. */
export async function createCompany(
  organizationId: string,
  input: { legalName: string; taxId?: string | null }
) {
  const db = getDb();
  const id = newId("company");
  await db.insert(schema.company).values({
    id,
    organizationId,
    legalName: input.legalName,
    taxId: input.taxId ?? null,
  });
  return id;
}

/** 005 — Listado de empresas de la organización, por razón social. */
export async function listCompanies(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId))
    .orderBy(asc(schema.company.legalName));
}

export function serializeCompany(c: typeof schema.company.$inferSelect) {
  return { id: c.id, legalName: c.legalName, taxId: c.taxId };
}
