/**
 * Prepara los videos para el volumen del servidor (`GUIA_VIDEOS_DIR`):
 * comprime cada render final, le saca su portada y, si hay una intro nueva en
 * `_intros/<id>.mp4`, la empalma delante del cuerpo (así cambiar la intro no
 * obliga a renderizar de nuevo los videos enteros).
 *
 *   node scripts/demos/guia/publicar.mjs            todos los de demos-output/guia/final
 *   node scripts/demos/guia/publicar.mjs <id> …     solo esos
 *
 * Sale en demos-output/guia/publicar/<id>.mp4 y <id>.jpg. Se procesa de a uno.
 * Cómo subirlos al servidor: docs/guia-videos.md.
 */

import { spawnSync } from "node:child_process";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { duracionDeVideo, resolverFfmpeg } from "../lib.mjs";

const SALIDA = path.resolve("demos-output/guia");
const FINAL = path.join(SALIDA, "final");
const INTROS = path.join(SALIDA, "_intros");
const PUBLICAR = path.join(SALIDA, "publicar");
/** La intro dura 66 fotogramas (2,2 s a 30 fps): del render final se descartan para poner la nueva. */
const FRAMES_INTRO = 66;
const existe = (f) => stat(f).then(() => true, () => false);

const ffmpeg = resolverFfmpeg();
if (!ffmpeg) throw new Error("no se encontró ffmpeg (FFMPEG_PATH, PATH o WinGet)");

const pedidos = process.argv.slice(2);
const ids = pedidos.length
  ? pedidos
  : (await readdir(FINAL)).filter((f) => f.endsWith(".mp4")).map((f) => f.slice(0, -4));
await mkdir(PUBLICAR, { recursive: true });

const CODEC = ["-c:v", "libx264", "-preset", "medium", "-crf", "24", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an"];

let total = 0;
let conIntroNueva = 0;
for (const id of ids) {
  const origen = path.join(FINAL, `${id}.mp4`);
  const intro = path.join(INTROS, `${id}.mp4`);
  const video = path.join(PUBLICAR, `${id}.mp4`);
  const portada = path.join(PUBLICAR, `${id}.jpg`);

  const empalmar = await existe(intro);
  const args = ["-y", "-loglevel", "error"];
  if (empalmar) {
    // Intro nueva + el render final sin sus primeros 66 fotogramas, en una sola pasada.
    args.push("-i", intro, "-i", origen, "-filter_complex",
      `[1:v]select=gte(n\\,${FRAMES_INTRO}),setpts=N/(30*TB)[cuerpo];[0:v][cuerpo]concat=n=2:v=1:a=0,format=yuv420p[v]`,
      "-map", "[v]", ...CODEC, video);
    conIntroNueva++;
  } else {
    args.push("-i", origen, ...CODEC, video);
  }
  const v = spawnSync(ffmpeg, args, { stdio: "inherit" });
  if (v.status !== 0) {
    console.error(`  ✘ ${id}`);
    continue;
  }

  // Portada: el fotograma más representativo de una ventana de 3 s a ~40 % del video.
  // (Un segundo fijo caía a veces sobre una pantalla todavía cargando.)
  const duracion = duracionDeVideo(video) ?? 40;
  const p = spawnSync(
    ffmpeg,
    ["-y", "-loglevel", "error", "-ss", (duracion * 0.4).toFixed(2), "-i", video,
      "-vf", "thumbnail=90,scale=960:-2", "-frames:v", "1", "-q:v", "4", portada],
    { stdio: "inherit" }
  );
  if (p.status !== 0) {
    console.error(`  ✘ portada de ${id}`);
    continue;
  }
  const mb = (await stat(video)).size / 1_048_576;
  total += mb;
  console.log(`  ✔ ${id}  ${mb.toFixed(1)} MB${empalmar ? "  (intro nueva)" : ""}`);
}
console.log(`\n${ids.length} videos (${conIntroNueva} con intro nueva), ${total.toFixed(0)} MB en ${PUBLICAR}`);
