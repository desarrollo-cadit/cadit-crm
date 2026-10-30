import { inflateRawSync } from "node:zlib";

/**
 * 0091 — Un lector de .xlsx mínimo y propio, SIN dependencias nuevas
 * (constitución II): un .xlsx es un zip con XML adentro. Lee la primera hoja y
 * devuelve las filas como listas de texto.
 *
 * Solo para el servidor (usa `node:zlib`). Soporta lo que escribe el export de
 * Autodesk —texto en línea (`inlineStr`)— y lo que escribe Excel —cadenas
 * compartidas (`sharedStrings`)—, además de números y booleanos. No soporta
 * ZIP64, cifrado ni macros, y lo dice en vez de adivinar.
 *
 * Los números vuelven como el texto que trae la celda: un `subscription_id`
 * como `7.4190503615179E13` ya perdió dígitos al exportarse, y nada de acá
 * intenta rehacerlo.
 */

export class XlsxInvalido extends Error {}

/** Lo que se acepta descomprimir de cada parte: un tope contra zips-bomba. */
const MAX_PARTE_BYTES = 80 * 1024 * 1024;
const MAX_FILAS = 100_000;
const MAX_COLUMNAS = 60;

type EntradaDeZip = { nombre: string; metodo: number; tamComprimido: number; offset: number };

const u16 = (b: Uint8Array, o: number) => b[o]! | (b[o + 1]! << 8);
const u32 = (b: Uint8Array, o: number) =>
  (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

/** ¿Empieza como un zip (`PK\x03\x04`)? */
export function pareceZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function entradasDelZip(bytes: Uint8Array): Map<string, EntradaDeZip> {
  // El "end of central directory" está al final, con a lo sumo 64 KB de comentario.
  const desde = Math.max(0, bytes.length - 22 - 0xffff);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= desde; i--) {
    if (u32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new XlsxInvalido("El archivo no es un .xlsx válido");
  const cantidad = u16(bytes, eocd + 10);
  let cursor = u32(bytes, eocd + 16);
  if (cantidad === 0xffff || cursor === 0xffffffff) {
    throw new XlsxInvalido("El .xlsx es demasiado grande (ZIP64 no se soporta)");
  }

  const entradas = new Map<string, EntradaDeZip>();
  for (let n = 0; n < cantidad; n++) {
    if (cursor + 46 > bytes.length || u32(bytes, cursor) !== 0x02014b50) {
      throw new XlsxInvalido("El archivo no es un .xlsx válido");
    }
    const metodo = u16(bytes, cursor + 10);
    const tamComprimido = u32(bytes, cursor + 20);
    const largoNombre = u16(bytes, cursor + 28);
    const largoExtra = u16(bytes, cursor + 30);
    const largoComentario = u16(bytes, cursor + 32);
    const offset = u32(bytes, cursor + 42);
    const nombre = Buffer.from(bytes.subarray(cursor + 46, cursor + 46 + largoNombre)).toString("utf8");
    entradas.set(nombre, { nombre, metodo, tamComprimido, offset });
    cursor += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

function leerParte(bytes: Uint8Array, e: EntradaDeZip): string {
  if (e.offset + 30 > bytes.length || u32(bytes, e.offset) !== 0x04034b50) {
    throw new XlsxInvalido("El archivo no es un .xlsx válido");
  }
  const inicio = e.offset + 30 + u16(bytes, e.offset + 26) + u16(bytes, e.offset + 28);
  const datos = bytes.subarray(inicio, inicio + e.tamComprimido);
  if (e.metodo === 0) return Buffer.from(datos).toString("utf8");
  if (e.metodo === 8) {
    try {
      return inflateRawSync(datos, { maxOutputLength: MAX_PARTE_BYTES }).toString("utf8");
    } catch {
      throw new XlsxInvalido("El .xlsx está dañado o es demasiado grande");
    }
  }
  throw new XlsxInvalido("El .xlsx usa una compresión que no se soporta");
}

function decodificar(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === "amp") return "&";
    if (e === "lt") return "<";
    if (e === "gt") return ">";
    if (e === "quot") return '"';
    if (e === "apos") return "'";
    const code = e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}

/** El texto de un `<si>` o `<is>`: todos sus `<t>`, sin la lectura fonética (`<rPh>`). */
function textoDe(xml: string): string {
  const limpio = xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
  let salida = "";
  for (const m of limpio.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) salida += m[1] ?? "";
  return decodificar(salida);
}

function cadenasCompartidas(xml: string | null): string[] {
  if (!xml) return [];
  return [...xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)].map((m) => textoDe(m[1] ?? ""));
}

/** `A` → 0, `B` → 1, `AA` → 26. */
function columnaDe(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** La ruta de la primera hoja: la del libro, o la primera `worksheets/*.xml`. */
function rutaDeLaPrimeraHoja(entradas: Map<string, EntradaDeZip>, leer: (n: string) => string | null): string {
  const libro = leer("xl/workbook.xml");
  const rels = leer("xl/_rels/workbook.xml.rels");
  if (libro && rels) {
    const rid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(libro)?.[1];
    if (rid) {
      for (const m of rels.matchAll(/<Relationship\b([^>]*?)\/?>/g)) {
        const attrs = m[1] ?? "";
        if (new RegExp(`\\bId="${rid}"`).test(attrs)) {
          const destino = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
          if (destino) {
            const ruta = destino.startsWith("/") ? destino.slice(1) : `xl/${destino}`;
            if (entradas.has(ruta)) return ruta;
          }
        }
      }
    }
  }
  const hojas = [...entradas.keys()].filter((n) => /^xl\/worksheets\/[^/]+\.xml$/.test(n)).sort();
  if (!hojas[0]) throw new XlsxInvalido("El .xlsx no tiene ninguna hoja");
  return hojas[0];
}

/** Las filas de la primera hoja del libro. Lanza `XlsxInvalido` si el archivo no sirve. */
export function leerXlsx(bytes: Uint8Array): string[][] {
  if (!pareceZip(bytes)) throw new XlsxInvalido("El archivo no es un .xlsx válido");
  const entradas = entradasDelZip(bytes);
  const leer = (nombre: string): string | null => {
    const e = entradas.get(nombre);
    return e ? leerParte(bytes, e) : null;
  };
  const compartidas = cadenasCompartidas(leer("xl/sharedStrings.xml"));
  const hoja = leer(rutaDeLaPrimeraHoja(entradas, leer));
  if (hoja === null) throw new XlsxInvalido("El .xlsx no tiene ninguna hoja");

  const filas: string[][] = [];
  for (const fila of hoja.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const celdas: string[] = [];
    for (const c of (fila[1] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1] ?? "";
      const cuerpo = c[2] ?? "";
      const ref = /\br="([A-Z]+)\d*"/.exec(attrs)?.[1];
      const col = ref ? columnaDe(ref) : celdas.length;
      if (col < 0 || col >= MAX_COLUMNAS) continue;
      const tipo = /\bt="(\w+)"/.exec(attrs)?.[1];
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cuerpo)?.[1];
      let valor = "";
      if (tipo === "inlineStr") valor = textoDe(/<is\b[^>]*>([\s\S]*?)<\/is>/.exec(cuerpo)?.[1] ?? "");
      else if (tipo === "s") valor = v !== undefined ? (compartidas[Number(v)] ?? "") : "";
      else if (tipo === "b") valor = v === "1" ? "VERDADERO" : "FALSO";
      else if (tipo === "e") valor = "";
      else valor = v !== undefined ? decodificar(v) : "";
      while (celdas.length <= col) celdas.push("");
      celdas[col] = valor;
    }
    filas.push(celdas);
    if (filas.length > MAX_FILAS) throw new XlsxInvalido(`El archivo tiene más de ${MAX_FILAS} filas`);
  }
  return filas;
}
