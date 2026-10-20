import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  buscarEmpresaPorNombre,
  cambiaElRut,
  normalizarRut,
  resolverEmpresa,
  type CompanyInput,
} from "@/lib/company";
import { completarEmpresaDelContacto } from "@/server/contact-company";
import type { CompanyDto } from "@/lib/types";

type CompanyRow = typeof schema.company.$inferSelect;

export type CompanyResult =
  | { ok: true; company: CompanyDto }
  | { ok: false; status: 404 | 409 | 422; code: string; message: string };

/** 005 — Listado de empresas de la organización, por razón social. */
export async function listCompanies(organizationId: string) {
  const db = getDb();
  return db
    .select()
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId))
    .orderBy(asc(schema.company.legalName));
}

/**
 * 040 — Todos los campos de la empresa. Ninguno es plata: la condición de
 * pago dice CÓMO paga, no cuánto. `GET /api/companies` sigue con
 * `contactos.ver`.
 */
export function serializeCompany(c: CompanyRow): CompanyDto {
  return {
    id: c.id,
    legalName: c.legalName,
    tradeName: c.tradeName,
    taxId: c.taxId,
    addressStreet: c.addressStreet,
    addressCity: c.addressCity,
    addressState: c.addressState,
    addressCountry: c.addressCountry,
    billingContactName: c.billingContactName,
    billingEmail: c.billingEmail,
    billingPhone: c.billingPhone,
    paymentTerms: c.paymentTerms,
    paymentTermDays: c.paymentTermDays,
    notes: c.notes,
  };
}

/**
 * DV-005 — ¿Otra empresa de la organización ya tiene este RUT? Se compara
 * normalizado (solo letras y dígitos) y en memoria: una academia tiene
 * decenas de empresas, no miles, y el RUT guardado conserva la escritura de
 * quien lo cargó.
 */
async function empresaConElMismoRut(
  organizationId: string,
  taxId: string,
  exceptoId: string | null
): Promise<Pick<CompanyRow, "id" | "legalName"> | null> {
  const buscado = normalizarRut(taxId);
  if (!buscado) return null;
  const filas = await getDb()
    .select({ id: schema.company.id, legalName: schema.company.legalName, taxId: schema.company.taxId })
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId));
  return (
    filas.find((f) => f.id !== exceptoId && f.taxId !== null && normalizarRut(f.taxId) === buscado) ??
    null
  );
}

const rutDuplicado = (otra: { legalName: string }) =>
  ({
    ok: false,
    status: 409,
    code: "rut_duplicado",
    message: `Ya hay una empresa con ese RUT: ${otra.legalName}.`,
  }) as const;

/** 005 (DV-009) + 040 — Alta de una empresa con sus datos de facturación. */
export async function createCompany(
  organizationId: string,
  input: CompanyInput
): Promise<CompanyResult> {
  const resuelta = resolverEmpresa(null, input);
  if (!resuelta.ok) return resuelta;

  if (resuelta.data.taxId) {
    const otra = await empresaConElMismoRut(organizationId, resuelta.data.taxId, null);
    if (otra) return rutDuplicado(otra);
  }

  const [row] = await getDb()
    .insert(schema.company)
    .values({ id: newId("company"), organizationId, ...resuelta.data })
    .returning();
  if (!row) {
    return { ok: false, status: 422, code: "not_created", message: "No se pudo guardar la empresa" };
  }
  return { ok: true, company: serializeCompany(row) };
}

/**
 * La empresa que alguien escribió al anotarse a un taller desde la web.
 *
 * Busca una empresa de la organización con esa razón social o ese nombre
 * comercial (`buscarEmpresaPorNombre`); si no hay, la crea con lo escrito como
 * razón social (sin RUT, así que no hay duplicado de RUT que controlar). Después
 * COMPLETA la empresa del contacto: nunca pisa una que ya tenía.
 *
 * Corre en un SAVEPOINT y no lanza: la empresa es un dato opcional, y perder
 * la inscripción por culpa de ella sería peor que perder el dato.
 */
export async function vincularEmpresaPorNombre(
  organizationId: string,
  contactId: string,
  nombre: string | null | undefined
): Promise<void> {
  const escrito = nombre?.trim();
  if (!escrito) return;
  try {
    await getDb().transaction(async () => {
      const empresas = await getDb()
        .select({
          id: schema.company.id,
          legalName: schema.company.legalName,
          tradeName: schema.company.tradeName,
        })
        .from(schema.company)
        .where(scoped(schema.company.organizationId, organizationId));
      let companyId = buscarEmpresaPorNombre(empresas, escrito);
      if (!companyId) {
        const creada = await createCompany(organizationId, { legalName: escrito });
        if (!creada.ok) return;
        companyId = creada.company.id;
      }
      await completarEmpresaDelContacto(organizationId, contactId, companyId);
    });
  } catch (err) {
    console.error(
      `[empresas] contacto ${contactId}: no se pudo vincular la empresa (${err instanceof Error ? err.name : "error"})`
    );
  }
}

/**
 * 040 (FR-005) — Edición. Lo que no viene se conserva. El duplicado de RUT
 * se controla solo si el RUT cambia: una base con duplicados históricos no
 * impide corregir una dirección.
 */
export async function updateCompany(
  organizationId: string,
  companyId: string,
  input: CompanyInput
): Promise<CompanyResult> {
  const db = getDb();
  const [actual] = await db
    .select()
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, companyId)))
    .limit(1);
  if (!actual) return { ok: false, status: 404, code: "not_found", message: "Empresa no encontrada" };

  const resuelta = resolverEmpresa(serializeCompany(actual), input);
  if (!resuelta.ok) return resuelta;

  if (resuelta.data.taxId && cambiaElRut(actual.taxId, resuelta.data.taxId)) {
    const otra = await empresaConElMismoRut(organizationId, resuelta.data.taxId, companyId);
    if (otra) return rutDuplicado(otra);
  }

  const [row] = await db
    .update(schema.company)
    .set({ ...resuelta.data, updatedAt: new Date() })
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, companyId)))
    .returning();
  if (!row) return { ok: false, status: 404, code: "not_found", message: "Empresa no encontrada" };
  return { ok: true, company: serializeCompany(row) };
}
