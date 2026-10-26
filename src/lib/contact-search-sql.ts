import { and, or, sql, type SQL, type SQLWrapper } from "drizzle-orm";
import {
  digitosDeTelefonoBuscado,
  escaparLike,
  MAPA_SIN_TILDES,
  tokensDeBusqueda,
} from "@/lib/contact-search";

/**
 * Búsqueda de contactos (2026-10-26) — la condición SQL de la regla de
 * `src/lib/contact-search.ts`: cada palabra en ALGÚN campo, sin tildes ni
 * mayúsculas, más el teléfono por sus dígitos.
 *
 * `translate(lower(col), desde, hacia)` en vez de `unaccent`: la extensión no
 * está instalada. Todo lo que escribió el usuario viaja como PARÁMETRO y con
 * los comodines escapados.
 */
export function condicionDeBusqueda(
  q: string,
  columnas: { texto: readonly SQLWrapper[]; telefono?: SQLWrapper }
): SQL | undefined {
  const tokens = tokensDeBusqueda(q);
  if (tokens.length === 0) return undefined;

  const campos = columnas.telefono ? [...columnas.texto, columnas.telefono] : [...columnas.texto];
  const normalizado = (c: SQLWrapper) =>
    sql`translate(lower(coalesce(${c}, '')), ${MAPA_SIN_TILDES.desde}, ${MAPA_SIN_TILDES.hacia})`;

  const porPalabra = and(
    ...tokens.map((t) => {
      const patron = `%${escaparLike(t)}%`;
      return or(...campos.map((c) => sql`${normalizado(c)} like ${patron}`));
    })
  );

  const digitos = digitosDeTelefonoBuscado(q);
  if (!digitos || !columnas.telefono) return porPalabra;
  return or(porPalabra, sql`coalesce(${columnas.telefono}, '') like ${`%${digitos}%`}`);
}
