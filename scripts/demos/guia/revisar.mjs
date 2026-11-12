/**
 * Revisión visual de un video grabado, sin verlo: extrae un fotograma por paso
 * (a mitad del paso) con la zona resaltada dibujada, en demos-output/guia/revision/.
 *
 *   node scripts/demos/guia/revisar.mjs <id>
 *
 * Luego se miran los PNG con la herramienta de lectura de imágenes.
 */

import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { resolverFfmpeg } from "../lib.mjs";

const id = process.argv[2];
if (!id) {
  console.error("Indique el id del video.");
  process.exit(1);
}
const SALIDA = path.resolve("demos-output/guia");
const ffmpeg = resolverFfmpeg();
if (!ffmpeg) throw new Error("no se encontró ffmpeg");

const tl = JSON.parse(await readFile(path.join(SALIDA, "timeline", `${id}.json`), "utf8"));
await mkdir(path.join(SALIDA, "revision"), { recursive: true });
const ESC = 1.5; // el video crudo es 2160 de ancho; las cajas están en 1440

tl.pasos.forEach((p, i) => {
  const t = tl.recorteInicio + (p.t0 + p.t1) / 2 + 0.3;
  const filtro = p.caja
    ? `drawbox=x=${Math.round(p.caja.x * ESC)}:y=${Math.round(p.caja.y * ESC)}:w=${Math.round(p.caja.w * ESC)}:h=${Math.round(p.caja.h * ESC)}:color=orange:t=8,scale=1440:-1`
    : "scale=1440:-1";
  const salida = path.join(SALIDA, "revision", `${id}-paso${i + 1}.png`);
  const r = spawnSync(ffmpeg, ["-y", "-loglevel", "error", "-ss", String(t), "-i", path.join(SALIDA, "raw", `${id}.mp4`), "-frames:v", "1", "-vf", filtro, salida]);
  console.log(`  paso ${i + 1}/${tl.pasos.length}  ${p.caja ? "caja" : "sin caja"}  → ${salida}${r.status ? "  (ERROR)" : ""}`);
});
console.log(`duración útil: ${tl.duracion.toFixed(0)} s (objetivo: 25–40 s)`);
