import { getEnv } from "@/lib/env";

/**
 * Limitación de tasa in-process por clave (IP) con ventana deslizante
 * (FR-062). Suficiente para el monolito de una instancia; sin Redis
 * (Constitución II).
 */

type Bucket = number[]; // timestamps (ms) de los intentos

const globalForRl = globalThis as unknown as {
  __voceroRateLimit?: Map<string, Bucket>;
};

function store(): Map<string, Bucket> {
  if (!globalForRl.__voceroRateLimit) {
    globalForRl.__voceroRateLimit = new Map();
  }
  return globalForRl.__voceroRateLimit;
}

export type RateLimitResult = { allowed: boolean; remaining: number };

export function checkRateLimit(
  key: string,
  opts: { windowMs: number; max: number },
  now: number = Date.now()
): RateLimitResult {
  const buckets = store();
  const cutoff = now - opts.windowMs;
  const bucket = (buckets.get(key) ?? []).filter((t) => t > cutoff);

  if (bucket.length >= opts.max) {
    buckets.set(key, bucket);
    return { allowed: false, remaining: 0 };
  }
  bucket.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: opts.max - bucket.length };
}

/** Solo para tests. */
export function resetRateLimit(): void {
  store().clear();
}

/** 10 intentos / 10 minutos por IP en login y registro (FR-062). */
export const AUTH_RATE_LIMIT = { windowMs: 10 * 60 * 1000, max: 10 };

/**
 * 007 — Envíos del formulario público por IP. Se agrega junto con CORS: al
 * habilitar la llamada desde el navegador del sitio comercial, la puerta
 * queda más cómoda de usar, y esto es lo que la cuida. Vale aclarar que el
 * límite es lo ÚNICO que frena a un script con curl — CORS solo lo aplica el
 * navegador. Configurable por entorno para poder aflojarlo en una campaña.
 */
export function publicFormRateLimit(): { windowMs: number; max: number } {
  const env = getEnv();
  return {
    windowMs: env.PUBLIC_FORM_RATE_WINDOW_MS,
    max: env.PUBLIC_FORM_RATE_LIMIT,
  };
}

/**
 * IP del visitante. Detrás de Caddy/Coolify la real viaja en
 * `x-forwarded-for` (primer valor); `x-real-ip` es el respaldo. Sin ninguna,
 * todos caen en el mismo balde "unknown", que es lo conservador.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

/** Respuesta 429 con `Retry-After`, igual en las dos puertas públicas. */
export function tooManyRequests(windowMs: number): Response {
  return Response.json(
    {
      error: {
        code: "rate_limited",
        message: "Demasiados envíos. Intentá de nuevo en unos minutos.",
      },
    },
    { status: 429, headers: { "Retry-After": String(Math.ceil(windowMs / 1000)) } }
  );
}
