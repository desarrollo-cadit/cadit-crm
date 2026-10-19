import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";

/**
 * 043 — La empresa de la PERSONA (`contact.company_id`).
 *
 * Inscribir a alguien con empresa la completa si el contacto no tenía
 * ninguna. **Nunca pisa una distinta**: la empresa de una venta dice quién
 * paga ESA inscripción, y una persona que cambió de trabajo puede tener una
 * inscripción vieja facturada a la empresa anterior. Lo que dice el contacto
 * lo corrige una persona desde la ficha.
 */
export async function completarEmpresaDelContacto(
  organizationId: string,
  contactId: string,
  companyId: string | null | undefined
): Promise<void> {
  if (!companyId) return;
  await getDb()
    .update(schema.contact)
    .set({ companyId, updatedAt: new Date() })
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        and(eq(schema.contact.id, contactId), isNull(schema.contact.companyId))
      )
    );
}

/** ¿La empresa existe en esta organización? (para validar antes de escribir) */
export async function empresaExiste(organizationId: string, companyId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: schema.company.id })
    .from(schema.company)
    .where(scoped(schema.company.organizationId, organizationId, eq(schema.company.id, companyId)))
    .limit(1);
  return Boolean(row);
}
