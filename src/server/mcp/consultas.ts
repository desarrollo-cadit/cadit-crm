import { desc, inArray, isNull } from "drizzle-orm";
import { condicionDeBusqueda } from "@/lib/contact-search-sql";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import type { TipoDeContacto } from "@/lib/recorrido-comercial";
import { fullName } from "@/lib/utils";
import { condicionDeTipo, tiposDeLaOrganizacion } from "@/server/contact-types";

/**
 * 0092 — Lecturas propias del MCP que la pantalla hace inline en su ruta.
 *
 * `buscarContactos` junta las MISMAS piezas que `GET /api/contacts`
 * (`condicionDeBusqueda`, `tiposDeLaOrganizacion`, `condicionDeTipo`) sin
 * duplicar ninguna regla: una palabra en algún campo, sin tildes ni mayúsculas,
 * y el tipo sale de la derivación única del historial. Devuelve lo mínimo para
 * elegir a una persona (id, nombre, tipo, empresa): ni teléfono ni correo.
 */

export type ContactoEncontrado = {
  id: string;
  nombre: string;
  tipo: TipoDeContacto;
  empresa: string | null;
};

export async function buscarContactos(
  organizationId: string,
  filtros: { q: string; tipo?: TipoDeContacto | null; limite: number }
): Promise<ContactoEncontrado[]> {
  const db = getDb();
  const busqueda = condicionDeBusqueda(filtros.q, {
    texto: [
      schema.contact.firstName,
      schema.contact.lastName,
      schema.contact.email,
      schema.contact.secondaryEmail,
    ],
    telefono: schema.contact.phone,
  });
  const tipos = await tiposDeLaOrganizacion(organizationId);

  const filas = await db
    .select({
      id: schema.contact.id,
      firstName: schema.contact.firstName,
      lastName: schema.contact.lastName,
      companyId: schema.contact.companyId,
    })
    .from(schema.contact)
    .where(
      scoped(
        schema.contact.organizationId,
        organizationId,
        busqueda,
        isNull(schema.contact.archivedAt),
        condicionDeTipo(filtros.tipo ?? null, tipos)
      )
    )
    .orderBy(desc(schema.contact.updatedAt))
    .limit(filtros.limite);

  const empresaIds = [...new Set(filas.map((f) => f.companyId).filter((id): id is string => Boolean(id)))];
  const empresas = new Map<string, string>();
  if (empresaIds.length > 0) {
    const rows = await db
      .select({
        id: schema.company.id,
        legalName: schema.company.legalName,
        tradeName: schema.company.tradeName,
      })
      .from(schema.company)
      .where(scoped(schema.company.organizationId, organizationId, inArray(schema.company.id, empresaIds)));
    for (const r of rows) empresas.set(r.id, r.tradeName ?? r.legalName);
  }

  return filas.map((f) => ({
    id: f.id,
    nombre: fullName({ firstName: f.firstName, lastName: f.lastName }),
    tipo: tipos.tipoDe(f.id),
    empresa: f.companyId ? (empresas.get(f.companyId) ?? null) : null,
  }));
}
