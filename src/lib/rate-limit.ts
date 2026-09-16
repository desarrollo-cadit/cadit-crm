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

const AUTH_RATE_LIMITED_PATHS = new Set(["/sign-in/email", "/sign-up/email"]);

/**
 * FR-062 — ¿Se deja pasar este intento de login/registro? Cuenta el intento
 * cuando corresponde.
 *
 * El límite existe contra la fuerza bruta DESDE AFUERA. Un alta que el
 * servidor hace por su cuenta —invitar a un alumno o a un profesor al portal,
 * sumar a alguien al equipo— ya pasó por la compuerta de capacidad del staff
 * y no es un intento de nadie: contarla hacía que todas las invitaciones
 * compartieran el balde "local" (no traen headers) y que la undécima de la
 * tarde fallara con `signup_failed`.
 *
 * El discriminador son DOS condiciones, y hacen falta las dos:
 *
 * - `request` ausente. El handler HTTP de Better Auth siempre le pasa el
 *   `Request` al endpoint; una llamada `auth.api.*` desde el servidor no.
 *   Un cliente externo no tiene forma de llegar sin pasar por el handler, así
 *   que no lo puede falsificar — a diferencia de un header, que sí.
 * - `internal`: la marca de `runInternalSignup()`, que solo existe dentro del
 *   proceso. Así un `auth.api.signInEmail` server-side sin marca sigue
 *   contando, y un pedido HTTP sigue contando aunque la marca se filtrara.
 */
export function authAttemptAllowed(
  input: {
    path: string;
    request: Request | undefined;
    headers?: Headers;
    internal: boolean;
  },
  now: number = Date.now()
): boolean {
  if (!AUTH_RATE_LIMITED_PATHS.has(input.path)) return true;
  if (input.internal && !input.request) return true;

  const headers = input.headers ?? input.request?.headers;
  const ip =
    headers?.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers?.get("x-real-ip") ||
    "local";
  return checkRateLimit(`${input.path}:${ip}`, AUTH_RATE_LIMIT, now).allowed;
}

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
