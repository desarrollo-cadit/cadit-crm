/**
 * Renderiza los mini-tutoriales: toma la grabación cruda y el timeline de cada
 * video (demos-output/guia/{raw,timeline}) y escribe demos-output/guia/final/<id>.mp4.
 *
 *   node render.mjs <id> [<id> …]     renderiza esos videos
 *   node render.mjs --todos           renderiza todos los que tienen timeline
 *   node render.mjs --todos --faltan  solo los que todavía no tienen render
 *
 * Uno por vez y con 2 hilos: por defecto Remotion abre un Chromium por núcleo,
 * y en una máquina con poca memoria eso la agota.
 */

import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { construirManifiesto } from "../../scripts/demos/guia/generar-manifiesto.mjs";
import { duracionDeVideo } from "../../scripts/demos/lib.mjs";
import { recortar } from "./recortar.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(aqui, "../../demos-output/guia");
const TIMELINES = path.join(SALIDA, "timeline");
const FINAL = path.join(SALIDA, "final");
// Carpeta pública del render: solo lo que la composición necesita (el bundle la copia entera).
const PUBLICO = path.join(SALIDA, "_render");

const args = process.argv.slice(2);
const existe = (f) => stat(f).then(() => true, () => false);
let ids = args.includes("--todos")
  ? (await readdir(TIMELINES)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""))
  : args.filter((a) => !a.startsWith("--"));
if (args.includes("--faltan")) {
  const pendientes = [];
  for (const id of ids) if (!(await existe(path.join(FINAL, `${id}.mp4`)))) pendientes.push(id);
  ids = pendientes;
}
if (!ids.length) {
  console.error("Nada para renderizar (indique ids o --todos).");
  process.exit(ids.length === 0 && args.includes("--faltan") ? 0 : 1);
}

await mkdir(FINAL, { recursive: true });
// Logo original de la app, para la intro y el cierre (nunca se redibuja).
await mkdir(path.join(PUBLICO, "marca"), { recursive: true });
await copyFile(path.resolve(aqui, "../../public/logo-cadit-completo.webp"), path.join(PUBLICO, "marca/logo-cadit-completo.webp"));

// «Para quién», título y sección salen del catálogo y de los roles reales, no de quien grabó el video.
const manifiesto = construirManifiesto();
const guiones = new Map();
for (const id of ids) {
  const props = JSON.parse(await readFile(path.join(TIMELINES, `${id}.json`), "utf8"));
  const entrada = manifiesto.find((v) => v.id === id);
  if (!entrada) throw new Error(`el video ${id} no está en el catálogo (o está marcado como oculto)`);
  props.para = entrada.para;
  props.titulo = entrada.titulo;
  props.grupo = entrada.grupo;
  // Los timelines grabados antes de corregir el grabador traen una duración inflada (incluía el tiempo
  // que tardó ffmpeg en armar el crudo). Se acota al último paso y al largo real del video.
  const crudo = duracionDeVideo(path.join(SALIDA, props.fuente));
  const ultimoPaso = props.pasos.at(-1)?.t1 ?? props.duracion;
  props.duracion = Number(
    Math.min(props.duracion, ultimoPaso + 1, crudo != null ? crudo - props.recorteInicio : Infinity).toFixed(2)
  );
  // Antes de empaquetar: el bundle copia la carpeta pública una sola vez.
  guiones.set(id, await recortar(id, props, SALIDA, PUBLICO));
}

const serveUrl = await bundle({ entryPoint: path.join(aqui, "src/index.ts"), publicDir: PUBLICO });

/**
 * Cuántos hilos usar AHORA, según la memoria libre. Medido: cada hilo es una
 * pestaña de Chromium de ~1,1 GB (con 5 hilos y 3,8 GB libres las pestañas se
 * caían con «Session closed»), y se deja ~1 GB para el sistema. Se decide antes
 * de cada video, así que si la máquina se carga con otra cosa el siguiente
 * render baja solo. Mínimo 2; tope `HILOS_MAX` (4 por defecto: más hilos casi no
 * suman, el costo fijo por fotograma domina).
 */
function hilosSegunMemoria() {
  const libreGb = os.freemem() / 2 ** 30;
  const tope = Number(process.env.HILOS_MAX ?? 4);
  return { libreGb, hilos: Math.max(2, Math.min(tope, Math.floor((libreGb - 1.0) / 1.1))) };
}

for (const [id, props] of guiones) {
  const { libreGb, hilos } = hilosSegunMemoria();
  const composition = await selectComposition({ serveUrl, id: "Guia", inputProps: props });
  const t = Date.now();
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    crf: 18,
    pixelFormat: "yuv420p",
    concurrency: hilos,
    // ANGLE usa la GPU: ~25 % más rápido que el render por software, medido.
    chromiumOptions: { gl: "angle" },
    outputLocation: path.join(FINAL, `${id}.mp4`),
    inputProps: props,
    logLevel: "error",
  });
  console.log(
    `  ✔ ${id}.mp4  (${((Date.now() - t) / 1000).toFixed(0)} s, ${(composition.durationInFrames / composition.fps).toFixed(0)} s de video, ${hilos} hilos, ${libreGb.toFixed(1)} GB libres al empezar)`
  );
}
