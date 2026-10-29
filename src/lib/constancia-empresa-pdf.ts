import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { BloqueDeConstancia, Constancia, FilaDeTabla } from "@/lib/constancia-empresa";

/**
 * 2026-10-29 — La constancia para una empresa como PDF (carta formal).
 *
 * Solo DIBUJA lo que armó `constancia-empresa.ts`. Usa las mismas fuentes que
 * el certificado (Poppins, `assets/certificados/fonts`, que el `Dockerfile` ya
 * copia) y el navy de la marca. Membrete con el nombre de la academia (no hay
 * logo en imagen en el repo), pie configurable repetido en cada página y
 * numeración. Las listas largas pasan de página; la tabla repite su
 * encabezado. Los colores van escritos porque es papel, no pantalla.
 */

const DIR = path.join(process.cwd(), "assets", "certificados", "fonts", "poppins");

const A4 = { w: 595.28, h: 841.89 };
const MARGEN = 56;
const ANCHO = A4.w - MARGEN * 2;

const TINTA = rgb(0.1, 0.1, 0.12);
const GRIS = rgb(0.38, 0.38, 0.42);
const GRIS_CLARO = rgb(0.85, 0.85, 0.87);
const FONDO_TABLA = rgb(0.94, 0.95, 0.97);
const MARCA = rgb(0, 0.106, 0.369); // navy de la marca (#001b5e)

const TAM = 10.5;
const INTERLINEA = 1.45;

type Lienzo = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  normal: PDFFont;
  negrita: PDFFont;
  semi: PDFFont;
  /** Alto reservado abajo para el pie. */
  piso: number;
};

/** Sin caracteres de control: un salto de línea en un nombre no se dibuja como basura. */
function limpio(t: string): string {
  return t.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Un carácter que la fuente no tiene (un emoji en un nombre que entró por un
 * formulario público) se omite en vez de dibujar un recuadro vacío.
 */
const juegos = new WeakMap<PDFFont, Set<number>>();
function dibujable(t: string, font: PDFFont): string {
  let juego = juegos.get(font);
  if (!juego) {
    juego = new Set(font.getCharacterSet());
    juegos.set(font, juego);
  }
  const ok = juego;
  return limpio(Array.from(t.normalize("NFC")).filter((ch) => ok.has(ch.codePointAt(0)!)).join(""));
}

function partir(t: string, font: PDFFont, size: number, max: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of dibujable(t, font).split(" ").filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(prueba, size) <= max || !actual) actual = prueba;
    else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);
  return lineas.length > 0 ? lineas : [""];
}

function nuevaPagina(l: Lienzo) {
  l.page = l.doc.addPage([A4.w, A4.h]);
  l.y = A4.h - MARGEN;
}

/** Garantiza `alto` puntos libres antes del pie; si no hay, página nueva. */
function espacio(l: Lienzo, alto: number): boolean {
  if (l.y - alto < l.piso) {
    nuevaPagina(l);
    return true;
  }
  return false;
}

function parrafo(
  l: Lienzo,
  t: string,
  opts: { x?: number; max?: number; font?: PDFFont; size?: number; color?: RGB; sangria?: number } = {}
) {
  const size = opts.size ?? TAM;
  const font = opts.font ?? l.normal;
  const x = opts.x ?? MARGEN;
  const max = opts.max ?? ANCHO - (x - MARGEN);
  const alto = size * INTERLINEA;
  const lineas = partir(t, font, size, max);
  lineas.forEach((linea, i) => {
    espacio(l, alto);
    l.y -= size;
    l.page.drawText(linea, {
      x: i > 0 && opts.sangria ? x + opts.sangria : x,
      y: l.y,
      size,
      font,
      color: opts.color ?? TINTA,
    });
    l.y -= alto - size;
  });
}

/** Un ítem numerado con sangría francesa: el número afuera, el texto alineado. */
function item(l: Lienzo, numero: number, t: string) {
  const etiqueta = `${numero}.`;
  const sangria = 20;
  const alto = TAM * INTERLINEA;
  const lineas = partir(t, l.normal, TAM, ANCHO - sangria);
  espacio(l, alto * Math.min(lineas.length, 2));
  lineas.forEach((linea, i) => {
    espacio(l, alto);
    l.y -= TAM;
    if (i === 0) l.page.drawText(etiqueta, { x: MARGEN, y: l.y, size: TAM, font: l.normal, color: TINTA });
    l.page.drawText(linea, { x: MARGEN + sangria, y: l.y, size: TAM, font: l.normal, color: TINTA });
    l.y -= alto - TAM;
  });
}

const COLUMNAS: { clave: keyof FilaDeTabla; titulo: string; ancho: number; derecha?: boolean }[] = [
  { clave: "alumno", titulo: "Alumno", ancho: 0.42 },
  { clave: "asistencia", titulo: "Asistencia", ancho: 0.14, derecha: true },
  { clave: "porcentaje", titulo: "%", ancho: 0.1, derecha: true },
  { clave: "faltas", titulo: "Faltas", ancho: 0.1, derecha: true },
  { clave: "resultado", titulo: "Resultado", ancho: 0.24 },
];

function encabezadoDeTabla(l: Lienzo) {
  const alto = 18;
  l.page.drawRectangle({ x: MARGEN, y: l.y - alto, width: ANCHO, height: alto, color: FONDO_TABLA });
  let x = MARGEN;
  for (const c of COLUMNAS) {
    const w = ANCHO * c.ancho;
    const size = 8.5;
    const tx = c.derecha ? x + w - 6 - l.semi.widthOfTextAtSize(c.titulo, size) : x + 6;
    l.page.drawText(c.titulo, { x: tx, y: l.y - 12.5, size, font: l.semi, color: GRIS });
    x += w;
  }
  l.y -= alto;
}

function tabla(l: Lienzo, filas: readonly FilaDeTabla[]) {
  if (filas.length === 0) return;
  const size = 9;
  espacio(l, 18 + 20 * Math.min(filas.length, 2));
  encabezadoDeTabla(l);
  for (const f of filas) {
    const celdas = COLUMNAS.map((c) => partir(f[c.clave], l.normal, size, ANCHO * c.ancho - 12));
    const lineas = Math.max(...celdas.map((c) => c.length));
    const alto = lineas * size * 1.35 + 8;
    if (espacio(l, alto)) encabezadoDeTabla(l);
    let x = MARGEN;
    COLUMNAS.forEach((c, i) => {
      const w = ANCHO * c.ancho;
      celdas[i]!.forEach((linea, j) => {
        const tx = c.derecha ? x + w - 6 - l.normal.widthOfTextAtSize(linea, size) : x + 6;
        l.page.drawText(linea, { x: tx, y: l.y - 4 - size - j * size * 1.35, size, font: l.normal, color: TINTA });
      });
      x += w;
    });
    l.y -= alto;
    l.page.drawLine({
      start: { x: MARGEN, y: l.y },
      end: { x: MARGEN + ANCHO, y: l.y },
      thickness: 0.5,
      color: GRIS_CLARO,
    });
  }
}

function bloque(l: Lienzo, b: BloqueDeConstancia) {
  if (b.titulo) {
    espacio(l, 60);
    l.y -= 6;
    parrafo(l, b.titulo, { font: l.negrita, size: 11.5, color: MARCA });
    l.y -= 2;
  }
  for (const p of b.parrafos) {
    parrafo(l, p);
    l.y -= 4;
  }
  l.y -= 2;
  parrafo(l, b.encabezadoLista);
  l.y -= 2;
  b.alumnos.forEach((a, i) => item(l, i + 1, a));
  l.y -= 10;
  tabla(l, b.tabla);
  l.y -= 14;
}

async function fuente(doc: PDFDocument, archivo: string): Promise<PDFFont> {
  const bytes = new Uint8Array(await readFile(path.join(DIR, archivo)));
  return doc.embedFont(bytes, { subset: false });
}

export async function renderConstanciaPdf(c: Constancia): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  doc.setTitle(`Constancia — ${c.empresa}`);
  doc.setAuthor(c.academia);
  doc.setCreator(c.academia);
  doc.setLanguage("es-UY");

  const [normal, semi, negrita] = await Promise.all([
    fuente(doc, "Poppins-Regular.ttf"),
    fuente(doc, "Poppins-SemiBold.ttf"),
    fuente(doc, "Poppins-Bold.ttf"),
  ]);
  const pie = c.pie.map((p) => dibujable(p, normal)).filter(Boolean);
  const l: Lienzo = {
    doc,
    page: doc.addPage([A4.w, A4.h]),
    y: A4.h - MARGEN,
    normal,
    semi,
    negrita,
    piso: MARGEN + 14 + pie.length * 10,
  };

  /* -- Membrete ---------------------------------------------- */
  const yArriba = l.y;
  const academia = dibujable(c.academia, negrita);
  l.page.drawText(academia, { x: MARGEN, y: yArriba - 18, size: 18, font: negrita, color: MARCA });
  const fecha = dibujable(c.lugarYFecha, normal);
  l.page.drawText(fecha, {
    x: A4.w - MARGEN - normal.widthOfTextAtSize(fecha, TAM),
    y: yArriba - 16,
    size: TAM,
    font: normal,
    color: TINTA,
  });
  l.y = yArriba - 28;
  l.page.drawLine({
    start: { x: MARGEN, y: l.y },
    end: { x: MARGEN + ANCHO, y: l.y },
    thickness: 1.2,
    color: MARCA,
  });
  l.y -= 26;

  /* -- Destinatario, asunto y saludo ------------------------- */
  c.destinatario.forEach((linea, i) => parrafo(l, linea, { font: i === 1 ? semi : normal }));
  l.y -= 12;
  parrafo(l, c.asunto, { font: negrita });
  l.y -= 12;
  parrafo(l, c.saludo);
  l.y -= 8;

  /* -- Un bloque por grupo ----------------------------------- */
  for (const b of c.bloques) bloque(l, b);

  /* -- Cierre y firma ---------------------------------------- */
  for (const p of c.cierre) {
    parrafo(l, p);
    l.y -= 4;
  }
  espacio(l, 90);
  l.y -= 50;
  l.page.drawLine({
    start: { x: MARGEN, y: l.y },
    end: { x: MARGEN + 190, y: l.y },
    thickness: 0.7,
    color: GRIS,
  });
  l.y -= 4;
  if (c.firma) {
    parrafo(l, c.firma.nombre, { font: semi });
    if (c.firma.cargo) parrafo(l, c.firma.cargo, { color: GRIS });
  }

  /* -- Pie y numeración, en todas las páginas ---------------- */
  const paginas = doc.getPages();
  paginas.forEach((p, i) => {
    pie.forEach((linea, j) => {
      const size = 7.5;
      const w = normal.widthOfTextAtSize(linea, size);
      p.drawText(linea, {
        x: (A4.w - w) / 2,
        y: MARGEN - 18 + (pie.length - 1 - j) * 10,
        size,
        font: normal,
        color: GRIS,
      });
    });
    const num = `${i + 1} / ${paginas.length}`;
    p.drawText(num, {
      x: A4.w - MARGEN - normal.widthOfTextAtSize(num, 7.5),
      y: MARGEN - 32,
      size: 7.5,
      font: normal,
      color: GRIS,
    });
  });

  return doc.save();
}
