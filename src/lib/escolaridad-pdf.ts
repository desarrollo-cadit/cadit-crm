import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { ModuleState } from "@/lib/approval";
import {
  ESTADO,
  periodo,
  resultado,
  type Escolaridad,
  type FilaDeCursada,
} from "@/lib/escolaridad";

/**
 * La escolaridad como PDF descargable, generado en el servidor.
 *
 * Reemplaza a la página HTML de "Imprimir → Guardar como PDF": el alumno
 * aprieta un botón y le baja el archivo. `pdf-lib` es JavaScript puro —sin
 * navegador headless ni servicio externo (constitución II)— y trae las fuentes
 * estándar de PDF embebidas, así que no lee archivos del disco.
 *
 * Mismo contenido que el armado puro de `escolaridad.ts`: este módulo solo
 * dibuja. Los colores van escritos porque es papel, no pantalla.
 */

const A4 = { w: 595.28, h: 841.89 };
const MARGEN = 50;
const ANCHO = A4.w - MARGEN * 2;
const PIE = 40;

const TINTA = rgb(0.1, 0.1, 0.1);
const GRIS = rgb(0.32, 0.32, 0.36);
const GRIS_CLARO = rgb(0.83, 0.83, 0.85);
const MARCA = rgb(0, 0.106, 0.369); // navy de la marca (#001b5e)

const COLOR_ESTADO: Record<ModuleState, RGB> = {
  aprobado: rgb(0.086, 0.396, 0.204),
  reprobado: rgb(0.6, 0.106, 0.106),
  pendiente: GRIS,
  sin_datos: GRIS,
};

type Lienzo = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  normal: PDFFont;
  negrita: PDFFont;
  pie: string;
};

/**
 * Las fuentes estándar solo conocen WinAnsi (tildes, ñ, ü, ¿, ¡, –, · sí;
 * emojis y otros alfabetos no). Un carácter fuera del juego haría fallar todo
 * el documento por un nombre raro: se omite en vez de tirar.
 */
function limpiar(texto: string, font: PDFFont): string {
  const soportados = new Set(font.getCharacterSet());
  return Array.from(texto.normalize("NFC"))
    .filter((ch) => soportados.has(ch.codePointAt(0)!))
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function partir(texto: string, font: PDFFont, size: number, max: number): string[] {
  const lineas: string[] = [];
  let actual = "";
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(prueba, size) <= max || !actual) {
      actual = prueba;
    } else {
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
function espacio(l: Lienzo, alto: number) {
  if (l.y - alto < MARGEN + PIE) nuevaPagina(l);
}

function texto(
  l: Lienzo,
  t: string,
  x: number,
  opts: { size: number; font?: PDFFont; color?: RGB; max?: number; interlineado?: number }
): number {
  const font = opts.font ?? l.normal;
  const lineas = partir(limpiar(t, font), font, opts.size, opts.max ?? ANCHO - (x - MARGEN));
  const alto = opts.size * (opts.interlineado ?? 1.3);
  for (const linea of lineas) {
    espacio(l, alto);
    l.y -= opts.size;
    l.page.drawText(linea, { x, y: l.y, size: opts.size, font, color: opts.color ?? TINTA });
    l.y -= alto - opts.size;
  }
  return lineas.length;
}

function linea(l: Lienzo, x: number, ancho: number, color: RGB = GRIS_CLARO, grosor = 0.6) {
  l.page.drawLine({
    start: { x, y: l.y },
    end: { x: x + ancho, y: l.y },
    thickness: grosor,
    color,
  });
}

function cursada(l: Lienzo, c: FilaDeCursada, sangria = 0) {
  const x = MARGEN + sangria;
  const ancho = ANCHO - sangria;
  const esModulo = sangria > 0;
  const estado = ESTADO[c.estado];
  const tamTitulo = esModulo ? 10.5 : 12;
  const anchoEstado = l.negrita.widthOfTextAtSize(estado, 9.5);

  // El título, la cohorte y la primera fila no se separan de página.
  espacio(l, 60);
  l.y -= esModulo ? 6 : 10;
  const yTitulo = l.y;
  texto(l, c.curso, x, {
    size: tamTitulo,
    font: l.negrita,
    max: ancho - anchoEstado - 12,
  });
  l.page.drawText(estado, {
    x: x + ancho - anchoEstado,
    y: yTitulo - tamTitulo,
    size: 9.5,
    font: l.negrita,
    color: COLOR_ESTADO[c.estado],
  });
  texto(l, `${c.cohorte} · ${periodo(c)}`, x, { size: 9, color: GRIS });

  if (!c.modulos) {
    const asistencia =
      c.asistenciaPct === null
        ? "Asistencia: sin registro"
        : `Asistencia: ${c.asistenciaPct}%${c.dispensada ? " (con dispensa)" : ""}`;
    texto(l, asistencia, x, { size: 9, color: GRIS });
  }

  if (c.evaluaciones.length > 0) {
    const colTipo = x + ancho * 0.6;
    l.y -= 6;
    espacio(l, 30);
    for (const [t, cx] of [["EVALUACIÓN", x], ["TIPO", colTipo]] as const) {
      l.page.drawText(t, { x: cx, y: l.y - 8, size: 7.5, font: l.negrita, color: GRIS });
    }
    const tRes = "RESULTADO";
    l.page.drawText(tRes, {
      x: x + ancho - l.negrita.widthOfTextAtSize(tRes, 7.5),
      y: l.y - 8,
      size: 7.5,
      font: l.negrita,
      color: GRIS,
    });
    l.y -= 12;
    linea(l, x, ancho);

    for (const e of c.evaluaciones) {
      const res = limpiar(resultado(e), l.normal);
      espacio(l, 18);
      const yFila = l.y;
      l.y -= 3;
      texto(l, e.nombre, x, { size: 9.5, max: ancho * 0.58 });
      const yFin = l.y;
      const base = yFila - 3 - 9.5;
      l.page.drawText(e.obligatoria ? "Obligatoria" : "Opcional", {
        x: colTipo,
        y: base,
        size: 9.5,
        font: l.normal,
        color: GRIS,
      });
      l.page.drawText(res, {
        x: x + ancho - l.normal.widthOfTextAtSize(res, 9.5),
        y: base,
        size: 9.5,
        font: l.normal,
        color: TINTA,
      });
      l.y = yFin - 2;
      linea(l, x, ancho, rgb(0.91, 0.91, 0.92), 0.4);
    }
  } else if (!c.modulos) {
    texto(l, "Sin evaluaciones cargadas.", x, { size: 9, color: GRIS });
  }

  for (const m of c.modulos ?? []) cursada(l, m, 14);

  if (!esModulo) {
    l.y -= 10;
    linea(l, MARGEN, ANCHO);
  }
}

export async function renderEscolaridadPdf(e: Escolaridad, tz: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Escolaridad — ${e.alumno.nombre}`);
  doc.setAuthor(e.academia);
  doc.setCreator(e.academia);
  doc.setLanguage("es-UY");

  const l: Lienzo = {
    doc,
    page: doc.addPage([A4.w, A4.h]),
    y: A4.h - MARGEN,
    normal: await doc.embedFont(StandardFonts.Helvetica),
    negrita: await doc.embedFont(StandardFonts.HelveticaBold),
    pie: `Documento informativo emitido por ${e.academia}. No reemplaza al certificado.`,
  };

  const emitida = new Intl.DateTimeFormat("es-UY", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: tz,
  }).format(e.emitidaEl);

  /* -- Encabezado -------------------------------------------- */
  const yArriba = l.y;
  texto(l, e.academia.toUpperCase(), MARGEN, { size: 8.5, font: l.negrita, color: MARCA, max: ANCHO - 160 });
  texto(l, "Escolaridad", MARGEN, { size: 22, font: l.negrita });
  const tEmitida = limpiar(`Emitida el ${emitida}`, l.normal);
  l.page.drawText(tEmitida, {
    x: A4.w - MARGEN - l.normal.widthOfTextAtSize(tEmitida, 9),
    y: yArriba - 9,
    size: 9,
    font: l.normal,
    color: GRIS,
  });
  l.y -= 6;
  linea(l, MARGEN, ANCHO, MARCA, 1.2);
  l.y -= 16;

  texto(l, e.alumno.nombre, MARGEN, { size: 13, font: l.negrita });
  if (e.alumno.documento) texto(l, `Documento ${e.alumno.documento}`, MARGEN, { size: 9.5, color: GRIS });
  l.y -= 6;
  linea(l, MARGEN, ANCHO);

  /* -- Cursadas ----------------------------------------------- */
  if (e.cursadas.length === 0) {
    l.y -= 14;
    texto(l, "Todavía no hay cursadas registradas.", MARGEN, { size: 10, color: GRIS });
  }
  for (const c of e.cursadas) cursada(l, c);

  /* -- Pie y numeración, en todas las páginas ----------------- */
  const paginas = doc.getPages();
  const pie = limpiar(l.pie, l.normal);
  paginas.forEach((p, i) => {
    p.drawText(pie, { x: MARGEN, y: MARGEN - 10, size: 8, font: l.normal, color: GRIS });
    const num = `${i + 1} / ${paginas.length}`;
    p.drawText(num, {
      x: A4.w - MARGEN - l.normal.widthOfTextAtSize(num, 8),
      y: MARGEN - 10,
      size: 8,
      font: l.normal,
      color: GRIS,
    });
  });

  return doc.save();
}

/** "Escolaridad - Ana Pérez.pdf", seguro para `Content-Disposition`. */
export function nombreDeArchivo(nombre: string): { ascii: string; utf8: string } {
  const base = `Escolaridad - ${nombre}`.replace(/[\\/:*?"<>|\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return {
    ascii: `${base.normalize("NFD").replace(/[^\x20-\x7e]/g, "")}.pdf`,
    utf8: encodeURIComponent(`${base}.pdf`),
  };
}

/** La respuesta de descarga, igual para las dos puertas (staff y alumno). */
export async function respuestaPdf(e: Escolaridad, tz: string): Promise<Response> {
  const pdf = await renderEscolaridadPdf(e, tz);
  const nombre = nombreDeArchivo(e.alumno.nombre);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${nombre.ascii}"; filename*=UTF-8''${nombre.utf8}`,
      "cache-control": "private, no-store",
    },
  });
}
