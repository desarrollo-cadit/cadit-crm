/**
 * Manifiesto de los videos de la guía: UNA fuente para la app, el render y los tests.
 *
 *   node scripts/demos/guia/generar-manifiesto.mjs      reescribe src/lib/guia-videos.data.ts
 *
 * Sale del catálogo (`catalogo.mjs`) y de los roles reales de
 * `src/lib/capabilities.ts`. Es determinista: no mira qué videos están
 * grabados o publicados (eso lo decide el volumen en tiempo de ejecución).
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CATALOGO } from "./catalogo.mjs";

// Rutas relativas a ESTE archivo, no al directorio de trabajo: lo importa también el render (tools/guia-video).
const RAIZ = new URL("../../../", import.meta.url);
const { SYSTEM_ROLES } = await import(new URL("src/lib/capabilities.ts", RAIZ).href);

const PARA_AUDIENCIA = { profesor: "Profesores", alumno: "Alumnos", publico: "Cualquier persona" };

/** Quién lo ve: los roles de sistema que tienen TODAS las capacidades que el video enseña. */
export function paraDe(video) {
  if (video.audiencia !== "staff") return PARA_AUDIENCIA[video.audiencia];
  if (video.requiere.length === 0) return "Todo el equipo";
  const roles = SYSTEM_ROLES.filter((r) => video.requiere.every((c) => r.capabilities.includes(c))).map((r) => r.name);
  return roles.length === SYSTEM_ROLES.length ? "Todo el equipo" : roles.join(" · ");
}

/** Los videos que la guía ofrece (las pantallas fuera del menú no entran). */
export function construirManifiesto() {
  return CATALOGO.filter((v) => v.estado !== "oculta").map((v, i) => ({
    id: v.id,
    titulo: v.titulo,
    grupo: v.grupo,
    audiencia: v.audiencia,
    requiere: [...v.requiere],
    orden: i + 1,
    para: paraDe(v),
  }));
}

export function renderizarTs(manifiesto) {
  const filas = manifiesto
    .map(
      (v) =>
        `  { id: ${JSON.stringify(v.id)}, titulo: ${JSON.stringify(v.titulo)}, grupo: ${JSON.stringify(v.grupo)}, audiencia: ${JSON.stringify(v.audiencia)}, requiere: ${JSON.stringify(v.requiere)}, orden: ${v.orden} },`
    )
    .join("\n");
  return `// GENERADO por scripts/demos/guia/generar-manifiesto.mjs — no editar a mano.
// Fuente: scripts/demos/guia/catalogo.mjs. \`tests/unit/guia-videos-cobertura.test.ts\`
// falla si este archivo se desincroniza del catálogo.
import type { GuiaVideo } from "@/lib/guia-videos";

export const GUIA_VIDEOS: readonly GuiaVideo[] = [
${filas}
];
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const manifiesto = construirManifiesto();
  await writeFile(new URL("src/lib/guia-videos.data.ts", RAIZ), renderizarTs(manifiesto), "utf8");
  console.log(`  ✔ src/lib/guia-videos.data.ts (${manifiesto.length} videos)`);
}
