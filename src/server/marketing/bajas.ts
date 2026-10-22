import { eq, isNull, or, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { normalizarCorreo } from "@/lib/contact-identity";

/**
 * 045 (DV-011; FR-003, FR-013) — LA regla de "dado de baja", una sola vez:
 * baja de marketing activa (`reverted_at IS NULL`) por `contact_id` O por el
 * correo normalizado. La usan las audiencias (al contar y al confirmar) y el
 * ejecutor (antes de cada envío): las dos preguntas no pueden contestar
 * distinto. Sobrevive al borrado del contacto porque mira el correo.
 */
export function whereDeBajaActiva(
  orgId: string,
  persona: { contactId: string | AnyPgColumn | null; email: string | SQL | null }
): SQL | null {
  const u = schema.marketingUnsubscribe;
  const porQuien = [
    persona.contactId !== null ? eq(schema.marketingUnsubscribe.contactId, persona.contactId) : undefined,
    persona.email !== null ? eq(schema.marketingUnsubscribe.email, persona.email) : undefined,
  ].filter((c): c is SQL => c !== undefined);
  if (porQuien.length === 0) return null;
  return scoped(u.organizationId, orgId, isNull(schema.marketingUnsubscribe.revertedAt), or(...porQuien));
}

/** ¿Tiene esta persona una baja de marketing activa? */
export async function bajaActiva(
  orgId: string,
  persona: { contactId: string | null; email: string | null }
): Promise<boolean> {
  const where = whereDeBajaActiva(orgId, {
    contactId: persona.contactId,
    email: normalizarCorreo(persona.email),
  });
  if (!where) return false;
  const [fila] = await getDb()
    .select({ id: schema.marketingUnsubscribe.id })
    .from(schema.marketingUnsubscribe)
    .where(where)
    .limit(1);
  return Boolean(fila);
}
