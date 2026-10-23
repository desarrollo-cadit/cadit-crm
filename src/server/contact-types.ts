import { inArray, notInArray, sql, type SQL } from "drizzle-orm";
import { schema } from "@/lib/db";
import { tipoDeContacto, type EntradaDeHistorial, type TipoDeContacto } from "@/lib/recorrido-comercial";
import { historialesDeLaOrganizacion } from "@/server/recorrido-comercial";

/**
 * 046 US7 (FR-023, FR-024) — El tipo de contacto como filtro de la lista.
 *
 * El tipo sale de `tipoDeContacto` sobre los historiales de la derivación
 * única; acá solo se arman los conjuntos de ids para que la lista filtre en
 * SQL y la paginación y la búsqueda sigan funcionando igual. Un contacto sin
 * historial es lead.
 */

export type IdsPorTipo = {
  alumno_activo: string[];
  exalumno: string[];
  tipoDe: (contactId: string) => TipoDeContacto;
};

export function idsPorTipo(historiales: ReadonlyMap<string, readonly EntradaDeHistorial[]>): IdsPorTipo {
  const tipos = new Map<string, TipoDeContacto>();
  for (const [contactId, historial] of historiales) tipos.set(contactId, tipoDeContacto(historial));
  const de = (t: TipoDeContacto) => [...tipos.entries()].filter(([, v]) => v === t).map(([k]) => k);
  return {
    alumno_activo: de("alumno_activo"),
    exalumno: de("exalumno"),
    tipoDe: (contactId) => tipos.get(contactId) ?? "lead",
  };
}

/**
 * La condición sobre `contact.id` para un tipo. Lead = ninguno de los otros
 * (`NOT IN`), así alcanza a quien nunca cursó nada. `null` = sin filtro.
 */
export function condicionDeTipo(tipo: TipoDeContacto | null, ids: IdsPorTipo): SQL | undefined {
  if (!tipo) return undefined;
  if (tipo === "lead") {
    const noLeads = [...ids.alumno_activo, ...ids.exalumno];
    return noLeads.length > 0 ? notInArray(schema.contact.id, noLeads) : undefined;
  }
  const lista = ids[tipo];
  return lista.length > 0 ? inArray(schema.contact.id, lista) : sql`false`;
}

/** Los conjuntos de toda la organización (una lectura de la derivación). */
export async function tiposDeLaOrganizacion(organizationId: string): Promise<IdsPorTipo> {
  return idsPorTipo(await historialesDeLaOrganizacion(organizationId));
}
