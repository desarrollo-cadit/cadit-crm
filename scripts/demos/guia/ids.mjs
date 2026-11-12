/**
 * Ids de los registros de la base de demostración que usan los guiones (un alumno
 * con certificado, uno con cuotas y pagos…).
 *
 * NO viven en el repositorio: son ids de filas reales de la copia de producción, y no
 * tiene sentido publicarlos. Los escribe `usuarios.mjs` en `demos-output/guia/ids.json`
 * (carpeta local, fuera de git) y los guiones los leen con `id("clave")`.
 *
 * Claves: alumno, profesor, legajo, estadoDeCuenta, seguimiento, auditoria.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const ARCHIVO = path.resolve("demos-output/guia/ids.json");

export function id(clave) {
  let ids = {};
  try {
    ids = JSON.parse(readFileSync(ARCHIVO, "utf8"));
  } catch {}
  const valor = ids[clave];
  if (!valor) {
    throw new Error(`falta «${clave}» en demos-output/guia/ids.json: corra scripts/demos/guia/usuarios.mjs primero`);
  }
  return valor;
}
