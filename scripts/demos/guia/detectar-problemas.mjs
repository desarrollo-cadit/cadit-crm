/**
 * Detecta problemas visibles en los videos renderizados, sin mirarlos uno a uno.
 *
 *   node scripts/demos/guia/detectar-problemas.mjs [<id> …]
 *
 * Mira un fotograma por segundo de la zona de la app (sin el subtítulo ni los
 * bordes) y marca:
 *   - pantalla en blanco: toda la zona casi blanca y sin contenido (la app todavía
 *     cargaba o se estaba cerrando un diálogo), de 2 s o más seguidos;
 *   - duración fuera de lo razonable (más de 70 s o menos de 15 s).
 *
 * Escribe demos-output/guia/problemas.json y lista los videos marcados.
 */

import { spawnSync } from "node:child_process";
import { readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolverFfmpeg } from "../lib.mjs";

const SALIDA = path.resolve("demos-output/guia");
const FINAL = path.join(SALIDA, "final");
const ffmpeg = resolverFfmpeg();
if (!ffmpeg) throw new Error("no se encontró ffmpeg");

// Zona de contenido de la ventana (1920×1080): arriba del subtítulo, adentro del marco.
const ZONA = "crop=1480:740:230:110";
const SEGUNDOS_EN_BLANCO = 2;

const pedidos = process.argv.slice(2);
const ids = pedidos.length ? pedidos : (await readdir(FINAL)).filter((f) => f.endsWith(".mp4")).map((f) => f.slice(0, -4));

function analizar(id) {
  const r = spawnSync(
    ffmpeg,
    ["-hide_banner", "-loglevel", "error", "-i", path.join(FINAL, `${id}.mp4`),
      "-vf", `${ZONA},fps=1,signalstats,metadata=mode=print:file=-`, "-f", "null", "-"],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  const filas = [];
  let actual = {};
  for (const linea of r.stdout.split("\n")) {
    const m = /lavfi\.signalstats\.(YAVG|YMIN|YMAX)=([\d.]+)/.exec(linea);
    if (m) {
      actual[m[1]] = Number(m[2]);
      if (m[1] === "YMAX") {
        filas.push(actual);
        actual = {};
      }
    }
  }
  return filas;
}

const informe = [];
for (const id of ids) {
  const filas = analizar(id);
  // Blanco = casi todo blanco y sin contraste (una pantalla con contenido tiene texto oscuro).
  const blanco = filas.map((f) => (f.YAVG ?? 0) >= 248 && (f.YMAX ?? 0) - (f.YMIN ?? 0) <= 12);
  let racha = 0;
  let peor = 0;
  let desde = -1;
  let mejorDesde = -1;
  blanco.forEach((b, i) => {
    if (b) {
      if (racha === 0) desde = i;
      racha++;
      if (racha > peor) {
        peor = racha;
        mejorDesde = desde;
      }
    } else racha = 0;
  });
  const problemas = [];
  if (peor >= SEGUNDOS_EN_BLANCO) problemas.push(`pantalla en blanco ${peor} s (desde el segundo ${mejorDesde})`);
  if (filas.length > 70) problemas.push(`dura ${filas.length} s`);
  if (filas.length < 15) problemas.push(`dura solo ${filas.length} s`);
  informe.push({ id, segundos: filas.length, problemas });
  if (problemas.length) console.log(`  ⚠ ${id}: ${problemas.join("; ")}`);
}

await writeFile(path.join(SALIDA, "problemas.json"), `${JSON.stringify(informe, null, 2)}\n`, "utf8");
const marcados = informe.filter((v) => v.problemas.length);
console.log(`\n${informe.length} videos revisados, ${marcados.length} con problemas → demos-output/guia/problemas.json`);
