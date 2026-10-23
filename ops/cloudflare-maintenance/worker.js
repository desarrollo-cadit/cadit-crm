/**
 * Página de mantenimiento delante del VPS.
 *
 * Cada pedido pasa al servidor tal cual. Si el servidor no responde (Cloudflare
 * devuelve 520–527, o el fetch lanza) o responde 502/503/504, el visitante ve
 * esta página en vez de la de error de Cloudflare. La página vive acá adentro:
 * funciona con el VPS apagado.
 *
 * Las rutas de API (`/api/*`, incluido el webhook de WhatsApp) reciben un 503
 * en JSON, nunca HTML: Meta reintenta un 503 y un cliente que espera JSON no
 * se rompe intentando parsear una página.
 */

import { PAGINA } from "./pagina.js";

const CAIDO = new Set([502, 503, 504, 520, 521, 522, 523, 524, 525, 526, 527, 530]);

export default {
  async fetch(request) {
    let respuesta;
    try {
      respuesta = await fetch(request);
    } catch {
      return mantenimiento(request);
    }
    if (CAIDO.has(respuesta.status)) return mantenimiento(request);
    return respuesta;
  },
};

function mantenimiento(request) {
  const headers = {
    "cache-control": "no-store",
    "retry-after": "60",
  };
  if (new URL(request.url).pathname.startsWith("/api/")) {
    return new Response(
      JSON.stringify({ error: { code: "mantenimiento", message: "Servicio en mantenimiento. Probá de nuevo en unos minutos." } }),
      { status: 503, headers: { ...headers, "content-type": "application/json; charset=utf-8" } }
    );
  }
  return new Response(PAGINA, {
    status: 503,
    headers: { ...headers, "content-type": "text/html; charset=utf-8" },
  });
}
