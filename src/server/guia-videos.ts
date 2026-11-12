import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { videoPorId } from "@/lib/guia-videos";

/**
 * Los videos de la guía viven en un VOLUMEN del servidor, no en la imagen ni en
 * git (`GUIA_VIDEOS_DIR`, por defecto `./data/guia-videos`): cada uno es
 * `<id>.mp4` con su portada `<id>.jpg`. Actualizar un video es copiar un
 * archivo, sin rehacer el build. No hay servicio externo (constitución II).
 *
 * El `id` SIEMPRE se valida contra el manifiesto antes de tocar el disco: nunca
 * se arma una ruta con lo que llega en la URL, así que no hay `../`.
 */

export type TipoDeArchivo = "video" | "portada";

export function carpetaDeVideos(): string {
  return path.resolve(process.env.GUIA_VIDEOS_DIR ?? path.join(process.cwd(), "data", "guia-videos"));
}

/** Los ids que tienen su `.mp4` publicado. Vacío si la carpeta no existe. */
export async function videosDisponibles(): Promise<Set<string>> {
  try {
    const archivos = await readdir(carpetaDeVideos());
    return new Set(archivos.filter((f) => f.endsWith(".mp4")).map((f) => f.slice(0, -4)));
  } catch {
    return new Set();
  }
}

const TIPOS: Record<TipoDeArchivo, { ext: string; mime: string }> = {
  video: { ext: ".mp4", mime: "video/mp4" },
  portada: { ext: ".jpg", mime: "image/jpeg" },
};

function rango(cabecera: string | null, tamano: number): { inicio: number; fin: number } | "invalido" | null {
  if (!cabecera) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(cabecera.trim());
  if (!m) return "invalido";
  let inicio: number;
  let fin: number;
  if (m[1] === "" && m[2] !== "") {
    inicio = Math.max(0, tamano - Number(m[2]));
    fin = tamano - 1;
  } else {
    inicio = Number(m[1]);
    fin = m[2] === "" ? tamano - 1 : Math.min(Number(m[2]), tamano - 1);
  }
  if (!Number.isFinite(inicio) || inicio > fin || inicio >= tamano) return "invalido";
  return { inicio, fin };
}

/**
 * Responde un archivo del volumen con soporte de rangos (adelantar y retroceder
 * el video) y ETag. `null` = el video no existe o no está publicado: la ruta
 * contesta 404, que es lo mismo que decir "no existe" (no revela nada).
 */
export async function servirArchivo(req: Request, id: string, tipo: TipoDeArchivo): Promise<Response | null> {
  if (!videoPorId(id)) return null;
  const { ext, mime } = TIPOS[tipo];
  const archivo = path.join(carpetaDeVideos(), `${id}${ext}`);

  let info;
  try {
    info = await stat(archivo);
  } catch {
    return null;
  }
  if (!info.isFile()) return null;

  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const comunes = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    ETag: etag,
    // Privado: son pantallas del panel; el navegador puede guardarlas, un proxy compartido no.
    "Cache-Control": "private, max-age=3600",
  };

  if (req.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: comunes });

  const pedido = rango(req.headers.get("range"), info.size);
  if (pedido === "invalido") {
    return new Response(null, { status: 416, headers: { ...comunes, "Content-Range": `bytes */${info.size}` } });
  }

  const { inicio, fin } = pedido ?? { inicio: 0, fin: info.size - 1 };
  const flujo = Readable.toWeb(createReadStream(archivo, { start: inicio, end: fin })) as ReadableStream;
  return new Response(flujo, {
    status: pedido ? 206 : 200,
    headers: {
      ...comunes,
      "Content-Length": String(fin - inicio + 1),
      ...(pedido ? { "Content-Range": `bytes ${inicio}-${fin}/${info.size}` } : {}),
    },
  });
}

/** `?poster=1` pide la portada en lugar del video. */
export function tipoPedido(req: Request): TipoDeArchivo {
  return new URL(req.url).searchParams.get("poster") === "1" ? "portada" : "video";
}
