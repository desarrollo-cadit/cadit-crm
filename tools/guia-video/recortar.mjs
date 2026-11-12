/**
 * Recorta las esperas de carga de un video crudo.
 *
 * Un paso del guion puede durar 20 o 30 segundos porque el servidor tardó en
 * responder; en el tutorial eso es una pantalla quieta con el mismo subtítulo.
 * Acá se acorta CADA paso largo conservando el principio (el cursor llega y se
 * hace la acción) y el final (el resultado ya cargado), y se recorta lo del
 * medio. Los pasos de duración normal no se tocan.
 *
 * Devuelve las props con los tiempos remapeados y deja el video recortado en
 * `<salida>/recortado/<id>.mp4`. Si no hay nada que recortar, devuelve las props
 * tal cual y no escribe nada.
 */

import { spawnSync } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { resolverFfmpeg } from "../../scripts/demos/lib.mjs";

/** Lo que dura un subtítulo con lectura cómoda: ~3 palabras por segundo, más un margen. */
const lecturaDe = (texto) => Math.max(2.4, texto.trim().split(/\s+/).length / 3 + 0.6);
/** Un paso se acorta si pasa de su lectura más este margen (acción + resultado). */
const MARGEN = 4;
/** Del paso acortado se conserva primero esto (el cursor llega y se actúa)… */
const CABEZA = 3;
/** Ancho del video que lee el render (el crudo es de 2160). Ver el comentario más abajo. */
const ANCHO_FUENTE = 1800;

export async function recortar(id, props, salida, publico) {
  // Segmentos [a, b] del video crudo (en segundos del archivo) que se conservan.
  const base = props.recorteInicio;
  const segmentos = [];
  const nuevosPasos = [];
  let cursor = 0; // tiempo en el video recortado (relativo al inicio útil)
  let previoFin = 0; // fin del último tramo conservado, en tiempo útil original
  let hayRecorte = false;

  for (const paso of props.pasos) {
    // El hueco entre pasos (si lo hay) se conserva entero.
    if (paso.t0 > previoFin) {
      segmentos.push([base + previoFin, base + paso.t0]);
      cursor += paso.t0 - previoFin;
    }
    const largo = paso.t1 - paso.t0;
    const tope = lecturaDe(paso.texto) + MARGEN;
    const nuevoInicio = cursor;
    if (largo > tope) {
      hayRecorte = true;
      const cola = tope - CABEZA;
      segmentos.push([base + paso.t0, base + paso.t0 + CABEZA]);
      segmentos.push([base + paso.t1 - cola, base + paso.t1]);
      cursor += tope;
    } else {
      segmentos.push([base + paso.t0, base + paso.t1]);
      cursor += largo;
    }
    nuevosPasos.push({ ...paso, t0: Number(nuevoInicio.toFixed(2)), t1: Number(cursor.toFixed(2)) });
    previoFin = paso.t1;
  }
  if (props.duracion > previoFin) {
    segmentos.push([base + previoFin, base + props.duracion]);
    cursor += props.duracion - previoFin;
  }
  const ffmpeg = resolverFfmpeg();
  if (!ffmpeg) throw new Error("no se encontró ffmpeg");
  const carpeta = path.join(publico, "recortado");
  await mkdir(carpeta, { recursive: true });
  const destino = path.join(carpeta, `${id}.mp4`);

  /**
   * SIEMPRE se genera un video propio para el render (aunque no haya nada que
   * recortar): se descarta la carga inicial y se reescala a `ANCHO_FUENTE`.
   * Decodificar y pasar a la página un fotograma de 2160×1350 en cada cuadro
   * era lo más caro del render (5,8 → 9 fps al bajar a 1440); 1800 con el zoom
   * limitado a 1,7× da la misma nitidez efectiva que 2160 a 2,1×.
   */
  const reescalar = `scale=${ANCHO_FUENTE}:-2:flags=lanczos,fps=30,format=yuv420p`;
  const args = ["-y", "-loglevel", "error"];
  if (hayRecorte) {
    const partes = segmentos.map(([a, b], i) => `[0:v]trim=start=${a.toFixed(3)}:end=${b.toFixed(3)},setpts=PTS-STARTPTS[v${i}]`);
    const unir = `${segmentos.map((_, i) => `[v${i}]`).join("")}concat=n=${segmentos.length}:v=1:a=0,${reescalar}[salida]`;
    args.push("-i", path.join(salida, props.fuente), "-filter_complex", `${partes.join(";")};${unir}`, "-map", "[salida]");
  } else {
    args.push("-ss", String(base), "-i", path.join(salida, props.fuente), "-t", String(props.duracion), "-vf", reescalar);
  }
  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "16", "-movflags", "+faststart", destino);
  // Un video ya preparado se reutiliza (FORZAR=1 lo rehace): al retomar un lote cortado no se repite
  // el trabajo de ffmpeg de los demás. Si el crudo se regrabó, hay que pasar FORZAR=1 o borrar el recortado.
  const yaPreparado = await stat(destino).then((s) => s.size > 0, () => false);
  if (!yaPreparado || process.env.FORZAR) {
    const r = spawnSync(ffmpeg, args, { stdio: "inherit" });
    if (r.status !== 0) throw new Error(`ffmpeg no pudo preparar ${id}`);
  }

  const total = hayRecorte ? cursor : props.duracion;
  console.log(`  ✂ ${id}: ${props.duracion.toFixed(0)} s → ${total.toFixed(0)} s`);
  return {
    ...props,
    fuente: `recortado/${id}.mp4`,
    recorteInicio: 0,
    duracion: Number(total.toFixed(2)),
    pasos: hayRecorte ? nuevosPasos : props.pasos,
  };
}
