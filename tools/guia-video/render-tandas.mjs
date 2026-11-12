/**
 * Renderiza los videos pendientes en TANDAS, cada una en un proceso nuevo.
 *
 *   node render-tandas.mjs [--tanda 8] [--reintentos 2]
 *
 * Un solo proceso largo acumula memoria (Chromium) y, tras unas decenas de
 * videos, el sistema lo corta; en tandas cortas cada proceso termina y libera
 * todo antes de la siguiente. Una tanda que sale mal se reintenta, y solo con
 * lo que le falte. «Pendiente» = tiene timeline y no tiene render final.
 */

import { spawn } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const aqui = path.dirname(fileURLToPath(import.meta.url));
const SALIDA = path.resolve(aqui, "../../demos-output/guia");
const arg = (nombre, defecto) => {
  const i = process.argv.indexOf(nombre);
  return i >= 0 ? Number(process.argv[i + 1]) : defecto;
};
const TANDA = arg("--tanda", 8);
const REINTENTOS = arg("--reintentos", 2);
const existe = (f) => stat(f).then(() => true, () => false);

async function pendientes() {
  const todos = (await readdir(path.join(SALIDA, "timeline"))).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5));
  const faltan = [];
  for (const id of todos) if (!(await existe(path.join(SALIDA, "final", `${id}.mp4`)))) faltan.push(id);
  return faltan;
}

function correr(ids) {
  return new Promise((resolve) => {
    const hijo = spawn(process.execPath, [path.join(aqui, "render.mjs"), ...ids], {
      cwd: aqui,
      env: { ...process.env, HILOS_MAX: process.env.HILOS_MAX ?? "2" },
      stdio: "inherit",
    });
    hijo.on("exit", (codigo) => resolve(codigo ?? 1));
  });
}

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let tanda = 0;
for (;;) {
  const faltan = await pendientes();
  if (!faltan.length) break;
  tanda++;
  let lote = faltan.slice(0, TANDA);
  console.log(`\n▶ tanda ${tanda}: ${lote.length} videos (${faltan.length} pendientes en total)`);
  for (let intento = 0; intento <= REINTENTOS && lote.length; intento++) {
    if (intento > 0) {
      console.log(`  ↻ reintento ${intento}/${REINTENTOS} de ${lote.length} video(s)`);
      await pausa(30_000); // que el sistema respire antes de volver a pedir memoria
    }
    const codigo = await correr(lote);
    const faltantes = [];
    for (const id of lote) if (!(await existe(path.join(SALIDA, "final", `${id}.mp4`)))) faltantes.push(id);
    lote = faltantes;
    if (codigo === 0 && !lote.length) break;
  }
  if (lote.length) {
    console.error(`  ✘ no se pudo renderizar: ${lote.join(", ")}. Se detiene para revisarlo.`);
    process.exit(1);
  }
  await pausa(10_000);
}
console.log("\n✔ todos los videos tienen su render");
