/**
 * Renderiza SOLO la intro de cada video (66 fotogramas) en demos-output/guia/_intros/<id>.mp4.
 *
 *   node render-intros.mjs --todos      todas las que tienen timeline
 *   node render-intros.mjs <id> …       solo esas
 *
 * `publicar.mjs` la empalma delante del cuerpo del video ya renderizado, así que cambiar
 * la intro no obliga a volver a renderizar los 103 videos completos.
 */

import { copyFile, mkdir, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { construirManifiesto } from "../../scripts/demos/guia/generar-manifiesto.mjs";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(aqui, "../../demos-output/guia");
const PUBLICO = path.join(SALIDA, "_render");
const INTROS = path.join(SALIDA, "_intros");
const existe = (f) => stat(f).then(() => true, () => false);

const args = process.argv.slice(2);
let ids = args.includes("--todos")
  ? (await readdir(path.join(SALIDA, "timeline"))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5))
  : args.filter((a) => !a.startsWith("--"));

await mkdir(INTROS, { recursive: true });
await mkdir(path.join(PUBLICO, "marca"), { recursive: true });
await copyFile(path.resolve(aqui, "../../public/logo-cadit-completo.webp"), path.join(PUBLICO, "marca/logo-cadit-completo.webp"));

const manifiesto = construirManifiesto();
const pendientes = [];
for (const id of ids) if (!(await existe(path.join(INTROS, `${id}.mp4`)))) pendientes.push(id);
console.log(`${pendientes.length} intros por renderizar`);
if (!pendientes.length) process.exit(0);

const serveUrl = await bundle({ entryPoint: path.join(aqui, "src/index.ts"), publicDir: PUBLICO });
for (const id of pendientes) {
  const entrada = manifiesto.find((v) => v.id === id);
  if (!entrada) throw new Error(`el video ${id} no está en el catálogo`);
  const props = JSON.parse(await readFile(path.join(SALIDA, "timeline", `${id}.json`), "utf8"));
  Object.assign(props, { titulo: entrada.titulo, grupo: entrada.grupo, para: entrada.para });
  const composition = await selectComposition({ serveUrl, id: "IntroGuia", inputProps: props });
  await renderMedia({
    composition, serveUrl, codec: "h264", crf: 14, pixelFormat: "yuv420p", concurrency: 2,
    chromiumOptions: { gl: "angle" }, outputLocation: path.join(INTROS, `${id}.mp4`), inputProps: props, logLevel: "error",
  });
  console.log(`  ✔ intro ${id}`);
}
