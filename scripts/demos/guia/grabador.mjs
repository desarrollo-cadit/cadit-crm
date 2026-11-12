/**
 * Grabador de los mini-tutoriales de la guía.
 *
 * Graba la app REAL (compilada en producción, contra `cadit_demo`) con un
 * contexto de Playwright limpio: sin subtítulos ni cursor dibujados encima.
 * Todo lo gráfico (zoom, resaltado, cursor, subtítulos, intro y cierre) lo
 * agrega después `tools/guia-video` (Remotion) a partir del timeline.
 *
 * La captura NO usa `recordVideo` (VP8 de bajo bitrate: el texto sale blando).
 * Usa el screencast del navegador a densidad de píxeles 2 y guarda cada cambio
 * de pantalla como JPEG con su marca de tiempo; después ffmpeg los une a 30 fps.
 *
 * Un guion es un módulo con `export default async (g) => { … }` que narra con:
 *   g.paso(texto, locator, { accion, sostener })   explica / hace clic en algo
 *   g.escribir(locator, texto)                      escribe como una persona
 *   g.pausa(segundos)                               respira sin subtítulo
 *   g.page                                          Playwright, para lo demás
 */

import { spawnSync } from "node:child_process";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { resolverFfmpeg } from "../lib.mjs";
import { CATALOGO } from "./catalogo.mjs";
import { cookiesDeRol } from "./sesiones.mjs";

export const BASE = process.env.APP_BASE_URL ?? "http://localhost:3006";
export const SALIDA = path.resolve("demos-output/guia");
export const TAMANO = { width: 1440, height: 900 };
/** Tamaño de los fotogramas guardados: 1,5× la pantalla, nítido incluso con zoom. */
const FOTOGRAMA = { width: 2160, height: 1350 };

if (!/localhost|127\.0\.0\.1/.test(BASE)) {
  console.error(`APP_BASE_URL=${BASE} no es local: la guía solo se graba contra el clon de demostración.`);
  process.exit(1);
}
if (process.env.DATABASE_URL && !/cadit_demo/.test(process.env.DATABASE_URL)) {
  console.error("DATABASE_URL no apunta a cadit_demo: la guía solo se graba contra el clon anonimizado.");
  process.exit(1);
}

const CLAVE = "Demo-Guia-2026";

const PARA = {
  direccion: "Dirección",
  coordinacion: "Coordinación",
  soporte: "Soporte",
  administracion: "Administración",
  ventas: "Ventas",
  profesor: "Profesores",
  alumno: "Alumnos",
  publico: "Cualquier persona",
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


/** Cuánto sostener un subtítulo: ~3 palabras por segundo, mínimo 2,4 s. */
const lectura = (texto) => Math.max(2.4, texto.trim().split(/\s+/).length / 3 + 0.6);

/** Une los fotogramas (con su duración real) en un mp4 a 30 fps constantes. */
function armarVideo(tmp, cuadros, finTs, destino) {
  const ffmpeg = resolverFfmpeg();
  if (!ffmpeg) throw new Error("no se encontró ffmpeg (FFMPEG_PATH, PATH o WinGet)");
  const lineas = [];
  cuadros.forEach((c, i) => {
    const siguiente = cuadros[i + 1]?.ts ?? finTs;
    lineas.push(`file '${path.basename(c.file)}'`, `duration ${Math.max(0.001, siguiente - c.ts).toFixed(4)}`);
  });
  // El demuxer concat ignora la duración del último: se repite.
  lineas.push(`file '${path.basename(cuadros[cuadros.length - 1].file)}'`);
  const lista = path.join(tmp, "lista.txt");
  return writeFile(lista, `${lineas.join("\n")}\n`).then(() => {
    const r = spawnSync(
      ffmpeg,
      ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", lista, "-vf", "fps=30,format=yuv420p",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "14", "-movflags", "+faststart", destino],
      { stdio: "inherit" }
    );
    if (r.status !== 0) throw new Error("ffmpeg no pudo armar el video");
  });
}

/**
 * @param {string} id        id del catálogo
 * @param {string} rol       direccion | coordinacion | soporte | administracion | ventas | profesor | alumno | publico
 * @param {string} ruta      pantalla donde arranca
 * @param {(g) => Promise<void>} guion
 */
export async function grabar(id, rol, ruta, guion) {
  const entrada = CATALOGO.find((v) => v.id === id);
  if (!entrada) throw new Error(`el video ${id} no está en el catálogo`);

  const tmp = path.join(SALIDA, "tmp", id);
  await rm(tmp, { recursive: true, force: true });
  await mkdir(tmp, { recursive: true });
  await mkdir(path.join(SALIDA, "raw"), { recursive: true });
  await mkdir(path.join(SALIDA, "timeline"), { recursive: true });

  // Sin este flag el screencast ignora la densidad de píxeles y entrega 1440×900.
  const browser = await chromium.launch({ args: ["--force-device-scale-factor=2"] });
  const context = await browser.newContext({
    viewport: TAMANO,
    deviceScaleFactor: 2,
    locale: "es-UY",
    timezoneId: "America/Montevideo",
  });
  // La sesión sale del disco (ver sesiones.mjs): iniciar sesión en cada grabación agota el cupo de ingresos.
  if (rol !== "publico") await context.addCookies(await cookiesDeRol(rol));

  const page = await context.newPage();

  /* Captura: cada cambio de pantalla llega como un JPEG con su marca de tiempo. */
  const cdp = await context.newCDPSession(page);
  const cuadros = [];
  const escrituras = [];
  let base = null; // marca de tiempo (s) del primer fotograma = segundo 0 del video
  cdp.on("Page.screencastFrame", (ev) => {
    const ts = ev.metadata.timestamp;
    if (base === null) base = ts;
    const file = path.join(tmp, `f${String(cuadros.length).padStart(6, "0")}.jpg`);
    cuadros.push({ file, ts });
    escrituras.push(writeFile(file, Buffer.from(ev.data, "base64")));
    cdp.send("Page.screencastFrameAck", { sessionId: ev.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 92,
    maxWidth: FOTOGRAMA.width,
    maxHeight: FOTOGRAMA.height,
    everyNthFrame: 1,
  });

  /** Segundos desde el primer fotograma, con el mismo reloj que los fotogramas. */
  const ahora = () => Date.now() / 1000 - (base ?? Date.now() / 1000);
  const pasos = [];
  let recorte = 0;

  const g = {
    page,
    async ir(destino) {
      // `networkidle` no sirve: el SSE de /api/events deja la red siempre abierta.
      await page.goto(`${BASE}${destino}`, { waitUntil: "load" });
      await sleep(2000);
    },
    /** Marca desde dónde empieza el video útil (después de cargar la pantalla). */
    comenzar() {
      recorte = ahora();
    },
    async pausa(segundos = 1) {
      await sleep(segundos * 1000);
    },
    /** Captura PNG para revisar el guion al escribirlo (demos-output/guia/revision/). */
    async captura(nombre) {
      await mkdir(path.join(SALIDA, "revision"), { recursive: true });
      await page.screenshot({ path: path.join(SALIDA, "revision", `${id}-${nombre}.png`) });
    },
    /**
     * Un paso del tutorial. Con `locator` se resalta esa zona; con `accion:
     * "clic"` se hace el clic real después de que el cursor llega.
     */
    async paso(texto, locator = null, { accion = "ver", sostener, despues } = {}) {
      let caja = null;
      if (locator) {
        await locator.first().waitFor({ state: "visible", timeout: 20000 });
        await locator.first().scrollIntoViewIfNeeded();
        await sleep(250);
        caja = await locator.first().boundingBox();
      }
      const t0 = ahora() - recorte;
      pasos.push({ t0, t1: 0, texto, caja, accion });
      const actual = pasos[pasos.length - 1];
      if (caja) {
        await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2, { steps: 18 });
      }
      await sleep(900);
      if (accion === "clic" && locator) {
        await locator.first().click();
        await sleep(450);
      }
      if (despues) await despues();
      const total = sostener ?? lectura(texto);
      const falta = total - (ahora() - recorte - t0);
      if (falta > 0) await sleep(falta * 1000);
      actual.t1 = ahora() - recorte;
    },
    async escribir(locator, texto, { retardo = 70 } = {}) {
      await locator.first().click();
      await locator.first().fill("");
      await locator.first().pressSequentially(texto, { delay: retardo });
    },
  };

  let ok = false;
  // La duración se mide ANTES de armar el video: ffmpeg puede tardar minutos y no es parte del tutorial.
  let duracionUtil = 0;
  try {
    await g.ir(ruta);
    g.comenzar();
    await guion(g);
    await sleep(600);
    ok = true;
  } finally {
    const duracion = ahora() - recorte;
    duracionUtil = duracion;
    const finTs = base === null ? 0 : base + ahora();
    // Con el guion fallido se conserva una captura para diagnosticar y no se deja ni video ni timeline.
    if (!ok) {
      await mkdir(path.join(SALIDA, "fallos"), { recursive: true });
      await page.screenshot({ path: path.join(SALIDA, "fallos", `${id}.png`) }).catch(() => {});
    }
    await cdp.send("Page.stopScreencast").catch(() => {});
    await context.close();
    await browser.close();
    await Promise.all(escrituras);
    if (ok) {
      await armarVideo(tmp, cuadros, finTs, path.join(SALIDA, "raw", `${id}.mp4`));
    }
    await rm(tmp, { recursive: true, force: true });
  }

  const props = {
    id,
    titulo: entrada.titulo,
    grupo: entrada.grupo,
    para: entrada.requiere.length || entrada.audiencia !== "staff" ? PARA[rol] : "Todo el equipo",
    pantalla: entrada.grupo,
    fuente: `raw/${id}.mp4`,
    recorteInicio: Number(recorte.toFixed(2)),
    duracion: Number(duracionUtil.toFixed(2)),
    ancho: TAMANO.width,
    alto: TAMANO.height,
    pasos: pasos.map((p) => ({
      t0: Number(p.t0.toFixed(2)),
      t1: Number((p.t1 || duracionUtil).toFixed(2)),
      texto: p.texto,
      caja: p.caja && { x: Math.round(p.caja.x), y: Math.round(p.caja.y), w: Math.round(p.caja.width), h: Math.round(p.caja.height) },
      accion: p.accion,
    })),
  };
  await writeFile(path.join(SALIDA, "timeline", `${id}.json`), `${JSON.stringify(props, null, 2)}\n`, "utf8");
  console.log(`  ● ${id}: ${props.pasos.length} pasos, ${props.duracion.toFixed(0)} s, ${cuadros.length} fotogramas`);
}
