/**
 * Búsqueda de contactos por texto (2026-10-26) — reglas puras, sin base.
 *
 * "Juan Pérez" no encontraba a nadie: el término entero se comparaba contra
 * UNA columna por vez (`first_name ILIKE '%Juan Pérez%'`), y el nombre y el
 * apellido viven en columnas distintas. La regla de ahora, la MISMA en SQL
 * (`src/lib/contact-search-sql.ts`) y en memoria (`coincideConBusqueda`):
 *
 * - La consulta se parte en palabras; CADA palabra tiene que aparecer en
 *   ALGÚN campo (nombre, apellido, correos, teléfono…). El orden no importa.
 * - Sin tildes ni mayúsculas, con un mapa EXPLÍCITO de letras: el SQL usa
 *   `translate(lower(…))` con este mismo mapa, porque la extensión `unaccent`
 *   no está instalada y no se agrega una extensión por esto.
 * - Un número escrito a mano ("099 123 456") busca además por los dígitos del
 *   teléfono, que se guarda solo con dígitos y código de país.
 *
 * Este archivo no importa nada de drizzle: lo usan también componentes de
 * cliente (bandeja, licencias, finanzas).
 */

/** Pares letra → base. Mayúsculas incluidas: `lower()` de PostgreSQL con
 *  una collation C no baja las letras acentuadas. */
const PARES: ReadonlyArray<readonly [string, string]> = [
  ["áàâäãå", "a"],
  ["éèêë", "e"],
  ["íìîï", "i"],
  ["óòôöõ", "o"],
  ["úùûü", "u"],
  ["ñ", "n"],
  ["ç", "c"],
];

function armarMapa(): { desde: string; hacia: string } {
  let desde = "";
  let hacia = "";
  for (const [letras, base] of PARES) {
    for (const l of [...letras, ...letras.toUpperCase()]) {
      desde += l;
      hacia += base;
    }
  }
  return { desde, hacia };
}

/** El mapa de `translate()`: `desde[i]` pasa a `hacia[i]`. */
export const MAPA_SIN_TILDES = armarMapa();

const REEMPLAZO = new Map<string, string>(
  [...MAPA_SIN_TILDES.desde].map((l, i) => [l, MAPA_SIN_TILDES.hacia[i] ?? l])
);

/** Tope de palabras: una consulta no crece sin límite. */
export const MAX_PALABRAS = 6;

/** Minúsculas y sin tildes, con el MISMO mapa que usa el SQL. */
export function normalizarBusqueda(s: string): string {
  let salida = "";
  for (const l of s.normalize("NFC").toLowerCase()) salida += REEMPLAZO.get(l) ?? l;
  return salida;
}

/** Las palabras de la consulta, normalizadas, sin repetir y con tope. */
export function tokensDeBusqueda(q: string): string[] {
  const palabras = normalizarBusqueda(q).split(/\s+/).filter(Boolean);
  return [...new Set(palabras)].slice(0, MAX_PALABRAS);
}

/** Escapa los comodines de LIKE (`\` es el escape por defecto en PostgreSQL). */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Si la consulta es un teléfono escrito a mano (sin letras, al menos 3
 * dígitos), sus dígitos sin los ceros de adelante: "099 123 456" se guarda
 * como "59899123456", así que se busca "99123456". Si no, `null`.
 */
export function digitosDeTelefonoBuscado(q: string): string | null {
  if (/\p{L}/u.test(q)) return null;
  const digitos = q.replace(/\D/g, "").replace(/^0+/, "");
  return digitos.length >= 3 ? digitos : null;
}

export type CamposBuscables = {
  texto: readonly (string | null | undefined)[];
  telefono?: string | null;
};

export type TramoResaltado = { texto: string; marca: boolean };

/**
 * 2026-10-26 (Académico) — Qué partes de `texto` resaltar para la consulta
 * `q`, con la MISMA normalización que la coincidencia. Se normaliza letra por
 * letra para poder cortar el texto ORIGINAL (con sus tildes): lo que se ve no
 * cambia, solo se marca. Devuelve tramos y no HTML: quien dibuja usa
 * `<mark>` de React, nunca `innerHTML`.
 */
export function tramosResaltados(original: string, q: string): TramoResaltado[] {
  // NFC primero: una tilde suelta (NFD) se normaliza junto con su letra.
  const texto = original.normalize("NFC");
  const tokens = tokensDeBusqueda(q);
  if (tokens.length === 0 || texto.length === 0) return [{ texto, marca: false }];

  // Texto normalizado y, para cada posición suya, de qué letra original vino.
  const letras = [...texto];
  let normalizado = "";
  const origen: number[] = [];
  let pos = 0;
  for (const l of letras) {
    const n = normalizarBusqueda(l);
    for (let i = 0; i < n.length; i++) origen.push(pos);
    normalizado += n;
    pos += l.length;
  }

  const marcadas = new Array<boolean>(texto.length).fill(false);
  for (const t of tokens) {
    let desde = normalizado.indexOf(t);
    while (desde !== -1) {
      const ini = origen[desde]!;
      const ultimo = origen[desde + t.length - 1]!;
      // La letra original del último carácter puede ocupar dos unidades.
      const fin = ultimo + (texto.codePointAt(ultimo)! > 0xffff ? 2 : 1);
      for (let i = ini; i < fin; i++) marcadas[i] = true;
      desde = normalizado.indexOf(t, desde + 1);
    }
  }

  const tramos: TramoResaltado[] = [];
  for (let i = 0; i < texto.length; i++) {
    const marca = marcadas[i]!;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.marca === marca) ultimo.texto += texto[i];
    else tramos.push({ texto: texto[i]!, marca });
  }
  return tramos;
}

/** La misma regla que el SQL, para listas que ya están en memoria. */
export function coincideConBusqueda(q: string, campos: CamposBuscables): boolean {
  const tokens = tokensDeBusqueda(q);
  if (tokens.length === 0) return true;
  const textos = [...campos.texto, campos.telefono]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .map(normalizarBusqueda);
  if (tokens.every((t) => textos.some((v) => v.includes(t)))) return true;
  const digitos = digitosDeTelefonoBuscado(q);
  return digitos !== null && (campos.telefono ?? "").replace(/\D/g, "").includes(digitos);
}
