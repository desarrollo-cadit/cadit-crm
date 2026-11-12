/**
 * Graba uno o varios guiones de scripts/demos/guia/guiones/<id>.mjs.
 *
 *   node scripts/demos/guia/grabar-guion.mjs inicio-dashboard [otro-id …]
 *
 * Cada guion exporta `{ rol, ruta, guion }`; ver grabador.mjs.
 */

import { pathToFileURL } from "node:url";
import path from "node:path";
import { grabar } from "./grabador.mjs";

const ids = process.argv.slice(2);
if (!ids.length) {
  console.error("Indique el id de al menos un guion.");
  process.exit(1);
}

let fallos = 0;
for (const id of ids) {
  try {
    const { rol, ruta, guion } = await import(pathToFileURL(path.resolve("scripts/demos/guia/guiones", `${id}.mjs`)).href);
    await grabar(id, rol, ruta, guion);
  } catch (err) {
    fallos++;
    console.error(`  ✘ ${id}: ${err.message.split("\n")[0]}`);
  }
}
process.exit(fallos ? 1 : 0);
