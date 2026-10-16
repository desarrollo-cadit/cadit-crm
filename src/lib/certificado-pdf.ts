import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  AZUL,
  GRIS_PIE,
  GRIS_TEXTO,
  PLANTILLA_DE,
  acomodarDescripcion,
  achicarParaEntrar,
  diagramaDe,
  distribuirModulos,
  nombreDeArchivoCertificado,
  partirTitulo,
  type CertificadoVista,
  type Diagrama,
  type FormatoDeCertificado,
  type Medidor,
} from "@/lib/certificado";

/**
 * 038 — El certificado como PDF, sobre la plantilla del diseño (FR-001).
 *
 * Se abre la plantilla del formato y se escribe ENCIMA solo lo variable: lo
 * fijo (formas, "CERTIFICACIÓN", logos, firmas, pie) es el PDF del
 * diseñador, intacto. Qué se escribe y dónde lo decide `certificado.ts`; este
 * módulo solo dibuja.
 *
 * Plantillas y fuentes viven en `assets/certificados/` y se leen del disco en
 * runtime, igual que las plantillas de correo: el trazado de `standalone` no
 * sigue estas rutas, y por eso el `Dockerfile` copia la carpeta a mano (ver
 * `tests/unit/imagen-docker.test.ts`). Nada se guarda: el PDF se genera al
 * pedirlo (constitución II).
 *
 * Las fuentes van embebidas ENTERAS y no en subconjunto: el subconjunto de
 * `@pdf-lib/fontkit` tiene fallas conocidas con algunos glifos, y un nombre
 * con tilde mal dibujado en un título es justo lo que no puede pasar.
 */

const DIR = path.join(process.cwd(), "assets", "certificados");

const FUENTES = {
  regular: "fonts/poppins/Poppins-Regular.ttf",
  semibold: "fonts/poppins/Poppins-SemiBold.ttf",
  bold: "fonts/poppins/Poppins-Bold.ttf",
  manuscrita: "fonts/parisienne/Parisienne-Regular.ttf",
} as const;
type Fuente = keyof typeof FUENTES;

/** Los archivos se leen una vez por proceso: no cambian sin un deploy. */
const cache = new Map<string, Promise<Uint8Array>>();
function leer(relativo: string): Promise<Uint8Array> {
  let p = cache.get(relativo);
  if (!p) {
    p = readFile(path.join(DIR, relativo)).then((b) => new Uint8Array(b));
    p.catch(() => cache.delete(relativo));
    cache.set(relativo, p);
  }
  return p;
}

const color = (c: { r: number; g: number; b: number }) => rgb(c.r / 255, c.g / 255, c.b / 255);

/** Sin caracteres de control: un salto de línea en un nombre no se dibuja como basura. */
function dibujable(texto: string): string {
  return texto.replace(/[\u0000-\u001f\u007f]+/g, " ");
}

function medidor(font: PDFFont): Medidor {
  return (t, size) => font.widthOfTextAtSize(dibujable(t), size);
}

function centrado(
  page: PDFPage,
  texto: string,
  o: { centro: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb> }
) {
  const t = dibujable(texto);
  const w = o.font.widthOfTextAtSize(t, o.size);
  page.drawText(t, { x: o.centro - w / 2, y: o.y, size: o.size, font: o.font, color: o.color });
}

/**
 * El año con su espaciado de letras ("2 0 2 5"): `pdf-lib` no tiene
 * espaciado de caracteres, así que va letra por letra. El espacio va ENTRE
 * letras, no después de la última, para que el centro sea el de lo que se ve.
 */
function espaciado(
  page: PDFPage,
  texto: string,
  o: { centro: number; y: number; size: number; tracking: number; font: PDFFont }
) {
  const letras = Array.from(texto);
  const extra = o.tracking * o.size;
  const total =
    letras.reduce((s, l) => s + o.font.widthOfTextAtSize(l, o.size), 0) +
    extra * (letras.length - 1);
  let x = o.centro - total / 2;
  for (const l of letras) {
    page.drawText(l, { x, y: o.y, size: o.size, font: o.font, color: color(AZUL) });
    x += o.font.widthOfTextAtSize(l, o.size) + extra;
  }
}

/**
 * La tilde en círculo del general, dibujada como vector en el mismo azul.
 * Medida sobre el ejemplo a 21 pt (radio 11,47): un aro cortado arriba a la
 * derecha, por donde sale el brazo largo de la tilde.
 */
const ARO =
  "M 5.80 -9.87 A 11.47 11.47 0 1 0 8.39 -7.86 L 6.79 -4.60 A 8.17 8.17 0 1 1 4.02 -7.10 Z";
const TILDE = "M -5.31 -3.04 L -1.16 0.54 L 9.96 -14.38 L 11.03 -14.87 L 0.36 5.63 Z";

function tildeEnCirculo(page: PDFPage, x: number, y: number, escala: number) {
  for (const d of [ARO, TILDE]) {
    page.drawSvgPath(d, { x, y, scale: escala, color: color(AZUL), borderWidth: 0 });
  }
}

type Fuentes = Record<Fuente, PDFFont>;

function dibujarEncabezado(page: PDFPage, v: CertificadoVista, d: Diagrama, f: Fuentes) {
  const t = partirTitulo(v.titulo, medidor(f.semibold), d.titulo);
  /**
   * Con una sola línea, el bloque título + año baja medio interlineado: así
   * queda equilibrado entre "CERTIFICACIÓN" y el nombre, en vez de dejar un
   * hueco de una línea entera arriba del nombre.
   */
  const inicio =
    t.lineas.length === 1 ? d.titulo.primeraLinea - d.titulo.interlineado / 2 : d.titulo.primeraLinea;
  t.lineas.forEach((linea, i) =>
    centrado(page, linea, {
      centro: d.titulo.centro,
      y: inicio - d.titulo.interlineado * i,
      size: t.size,
      font: f.semibold,
      color: color(AZUL),
    })
  );
  const ultima = inicio - d.titulo.interlineado * (t.lineas.length - 1);
  espaciado(page, v.anio, {
    centro: d.titulo.centro,
    y: ultima - d.anio.distancia,
    size: d.anio.size,
    tracking: d.anio.tracking,
    font: f.semibold,
  });

  centrado(page, v.alumno, {
    centro: d.alumno.centro,
    y: d.alumno.y,
    // FR-005 — se achica lo que haga falta: nunca se corta ni se sale.
    size: achicarParaEntrar(v.alumno, medidor(f.manuscrita), d.alumno),
    font: f.manuscrita,
    color: color(AZUL),
  });
  centrado(page, v.frase, {
    centro: d.frase.centro,
    y: d.frase.y,
    size: achicarParaEntrar(v.frase, medidor(f.regular), d.frase),
    font: f.regular,
    color: color(GRIS_TEXTO),
  });
}

function dibujarLista(page: PDFPage, v: CertificadoVista, d: Diagrama, f: Fuentes) {
  const lista = d.lista;
  if (!lista || v.modulos.length === 0) return;
  const reparto = distribuirModulos(v.modulos.length, lista);
  const medir = medidor(f.bold);
  // Una sola letra para toda la lista: un módulo más chico que los demás se lee como menos importante.
  const size = Math.min(
    reparto.size,
    ...v.modulos.map((m) => achicarParaEntrar(m, medir, { size: reparto.size, ancho: lista.anchoTexto }))
  );
  const k = size / lista.size;
  const anchoTexto = Math.max(...v.modulos.map((m) => medir(m, size)));
  const anchoBloque = lista.radioIcono * k + lista.sangria * k + anchoTexto;
  const centroIcono = d.pagina.ancho / 2 - anchoBloque / 2 + lista.radioIcono * k;
  const xTexto = centroIcono + lista.sangria * k;
  v.modulos.forEach((m, i) => {
    const y = reparto.baselines[i]!;
    tildeEnCirculo(page, centroIcono, y + lista.alturaIcono * k, k);
    page.drawText(dibujable(m), { x: xTexto, y, size, font: f.bold, color: color(AZUL) });
  });
}

function dibujarModuloYDescripcion(page: PDFPage, v: CertificadoVista, d: Diagrama, f: Fuentes) {
  if (d.modulo && v.nombreModulo) {
    centrado(page, v.nombreModulo, {
      centro: d.modulo.centro,
      y: d.modulo.y,
      size: achicarParaEntrar(v.nombreModulo, medidor(f.bold), d.modulo),
      font: f.bold,
      color: color(AZUL),
    });
  }
  if (d.descripcion && v.descripcion) {
    const caja = d.descripcion;
    // Dónde empieza y cuánto interlineado lleva lo decide el acomodo: es el
    // que garantiza que ninguna letra baje hasta las firmas.
    const a = acomodarDescripcion(v.descripcion, medidor(f.regular), caja);
    a.lineas.forEach((linea, i) =>
      centrado(page, linea, {
        centro: caja.centro,
        y: a.primeraLinea - a.interlineado * i,
        size: a.size,
        font: f.regular,
        color: color(GRIS_TEXTO),
      })
    );
  }
}

/** FR-006 — Código y verificación: chiquitos, grises, debajo del pie del diseño. */
function dibujarVerificacion(page: PDFPage, v: CertificadoVista, d: Diagrama, f: Fuentes) {
  const texto = `Código ${v.codigo} · Verificá este certificado en ${v.verificacion}`;
  centrado(page, texto, {
    centro: d.verificacion.centro,
    y: d.verificacion.y,
    size: achicarParaEntrar(texto, medidor(f.regular), {
      size: d.verificacion.size,
      ancho: d.pagina.ancho - 60,
    }),
    font: f.regular,
    color: color(GRIS_PIE),
  });
}

async function cargarFuentes(doc: PDFDocument): Promise<Fuentes> {
  doc.registerFontkit(fontkit);
  const entradas = await Promise.all(
    (Object.keys(FUENTES) as Fuente[]).map(async (k) => {
      const font = await doc.embedFont(await leer(FUENTES[k]), { subset: false });
      return [k, font] as const;
    })
  );
  return Object.fromEntries(entradas) as Fuentes;
}

/** 038 (FR-001) — El PDF del certificado. */
export async function renderCertificadoPdf(v: CertificadoVista): Promise<Uint8Array> {
  const doc = await PDFDocument.load(await leer(PLANTILLA_DE[v.formato]));
  const page = doc.getPage(0);
  const d = diagramaDe(v.formato);
  const f = await cargarFuentes(doc);

  dibujarEncabezado(page, v, d, f);
  dibujarLista(page, v, d, f);
  dibujarModuloYDescripcion(page, v, d, f);
  dibujarVerificacion(page, v, d, f);

  doc.setTitle(`Certificado — ${v.alumno} — ${v.titulo}`);
  doc.setAuthor("CAD IT");
  doc.setSubject(v.verificacion);
  return doc.save();
}

/**
 * Varias hojas en un solo PDF (las muestras para el dueño: los tres módulos
 * de Luis juntos). Cada hoja sale de su propio render, idéntico al individual.
 */
export async function renderCertificadosPdf(vistas: CertificadoVista[]): Promise<Uint8Array> {
  const salida = await PDFDocument.create();
  for (const v of vistas) {
    const uno = await PDFDocument.load(await renderCertificadoPdf(v));
    const [pagina] = await salida.copyPages(uno, [0]);
    salida.addPage(pagina);
  }
  return salida.save();
}

/** La respuesta de descarga, igual para las dos puertas (staff y alumno, FR-015). */
export async function respuestaCertificadoPdf(
  v: CertificadoVista,
  nombreCurso: string
): Promise<Response> {
  const pdf = await renderCertificadoPdf(v);
  const nombre = nombreDeArchivoCertificado(v.alumno, nombreCurso);
  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${nombre.ascii}"; filename*=UTF-8''${nombre.utf8}`,
      "cache-control": "private, no-store",
    },
  });
}

/**
 * 038 (US3, escenario 3) — ¿La descripción entra en la caja del diseño?
 *
 * Se mide con la fuente REAL y la misma caja que usa el dibujo: un conteo de
 * caracteres no sabe que "MMMM" ocupa el triple que "iiii". Vale igual para
 * el curso y el módulo: los dos formatos horizontales comparten la caja.
 */
export async function descripcionEntraEnCertificado(texto: string): Promise<boolean> {
  const caja = diagramaDe("modulo").descripcion!;
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(await leer(FUENTES.regular), { subset: false });
  return acomodarDescripcion(texto, medidor(font), caja).entra;
}

/** La misma pregunta, como el mensaje que la ruta devuelve en un 422. */
export async function errorDeDescripcionDeCertificado(
  texto: string | null | undefined
): Promise<string | null> {
  if (!texto) return null;
  return (await descripcionEntraEnCertificado(texto))
    ? null
    : "La descripción del certificado no entra en el diseño: acortala (hasta 4 líneas)";
}

export type { FormatoDeCertificado };
