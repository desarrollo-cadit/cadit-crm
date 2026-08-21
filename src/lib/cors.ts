import { getEnv } from "@/lib/env";

/**
 * 007 — CORS para `/api/public/*`.
 *
 * Por qué hace falta: el sitio comercial vive en otro dominio (cadit.com.uy)
 * y el CRM en el suyo. Un `fetch` con `content-type: application/json`
 * dispara preflight `OPTIONS`, y sin estas cabeceras el navegador cancela la
 * llamada antes de que el servidor la vea.
 *
 * Qué NO es: una medida de seguridad. CORS solo lo aplica el navegador; un
 * script con curl llama igual. Lo que protege de verdad al formulario es el
 * límite por IP (`src/lib/rate-limit.ts`), que corre del lado del servidor.
 */

/** `*` o la lista de `PUBLIC_CORS_ORIGINS` que incluya al origen que llama. */
export function resolveAllowedOrigin(requestOrigin: string | null): string | null {
  const configured = getEnv()
    .PUBLIC_CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  if (configured.includes("*")) return "*";
  if (!requestOrigin) return null;
  return configured.includes(requestOrigin) ? requestOrigin : null;
}

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = resolveAllowedOrigin(req.headers.get("origin"));
  if (!allowed) return {};
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    // Con una lista de orígenes la respuesta cambia según quién llame: sin
    // `Vary` un caché intermedio le serviría a un origen la cabecera de otro.
    ...(allowed === "*" ? {} : { Vary: "Origin" }),
  };
}

/** Respuesta al preflight `OPTIONS`. */
export function corsPreflight(req: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

/** Agrega las cabeceras CORS a una respuesta ya armada. */
export function withCors(req: Request, res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(req))) headers.set(k, v);
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}
