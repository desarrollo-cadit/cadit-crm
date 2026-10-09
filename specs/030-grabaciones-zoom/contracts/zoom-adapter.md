# Contrato — adaptador `src/lib/zoom`

Único módulo del repositorio que sabe qué es un token de Zoom, una URL de la
API de Zoom o la forma de su JSON (constitución II, enmienda 1.6.0). El dominio
(`src/server/zoom/*`) recibe tipos propios y errores propios. Guard estructural:
`tests/unit/zoom-adapter-guard.test.ts` falla si `api.zoom.us`, `zoom.us/oauth`
o `fetch(` hacia Zoom aparecen fuera de `src/lib/zoom/`.

## Archivos

```text
src/lib/zoom/
├── client.ts      # token S2S por conexión, request con reintentos, listUsers, listUserRecordings
├── types.ts       # ZoomCredentials, ZoomUser, ZoomRecordingMeeting, ZoomError
├── links.ts       # buildPlayUrl(), extractMeetingId() — puras, sin red
└── index.ts       # re-export
```

## Configuración por entorno

| Variable | Default | Uso |
|---|---|---|
| `ZOOM_API_BASE_URL` | `https://api.zoom.us/v2` | El arnés lo apunta a `<app>/api/dev/zoom-mock/v2` |
| `ZOOM_OAUTH_BASE_URL` | `https://zoom.us` | El arnés lo apunta a `<app>/api/dev/zoom-mock` |
| `ZOOM_SYNC_INTERVAL_MIN` | `60` | `0` apaga la sincronización periódica (lo consume `src/server/zoom/scheduler.ts`) |
| `ZOOM_SYNC_BACKFILL_DAYS` | `90` | Primera corrida de una conexión |
| `ZOOM_SYNC_OVERLAP_DAYS` | `3` | Re-consulta hacia atrás en cada corrida |
| `ZOOM_MATCH_BEFORE_MIN` | `30` | Tolerancia antes del inicio de la clase |
| `ZOOM_MATCH_AFTER_FALLBACK_MIN` | `180` | Fin supuesto si la clase no tiene `end_time` |

Las credenciales NO van en entorno: viven cifradas en `zoom_connection`.

## Tipos

```ts
export type ZoomCredentials = {
  connectionId: string;   // llave del caché de token
  accountId: string;
  clientId: string;
  clientSecret: string;   // ya descifrado por el llamador; nunca se loguea
};

export type ZoomUser = { id: string; email: string; displayName: string; type: number; status: string };

export type ZoomRecordingMeeting = {
  uuid: string;                 // instancia — llave de idempotencia
  meetingId: string;            // `id` numérico como string
  hostId: string;
  hostEmail: string | null;
  topic: string | null;
  startTime: Date;              // UTC
  durationMin: number | null;
  totalSizeBytes: number | null;
  fileCount: number | null;
  shareUrl: string | null;
  playPasscode: string | null;  // `recording_play_passcode`
  password: string | null;      // `password`
  autoDeleteDate: string | null; // YYYY-MM-DD
};

export type ZoomErrorCode =
  | "credenciales_invalidas"  // token 400/401 (invalid_client)
  | "sin_permiso"             // 403 / 4711 scope faltante
  | "usuario_inexistente"     // 404 / 1001
  | "limite_de_tasa"          // 429 tras agotar reintentos
  | "zoom_caido"              // 5xx / red tras agotar reintentos
  | "respuesta_invalida";     // JSON que no valida con Zod

export class ZoomError extends Error {
  constructor(readonly code: ZoomErrorCode, message: string) { super(message); }
}
```

`message` es SIEMPRE un texto propio en castellano: nunca incluye el secreto,
el token, el header `Authorization` ni el cuerpo crudo de Zoom.

## Funciones

```ts
/** Token S2S, cacheado por connectionId hasta expires_in − 60 s. */
getAccessToken(creds: ZoomCredentials): Promise<string>
//   POST {OAUTH_BASE}/oauth/token?grant_type=account_credentials&account_id={accountId}
//   Authorization: Basic base64(clientId:clientSecret)

/** Invalida el token cacheado (al editar credenciales o ante 401). */
forgetToken(connectionId: string): void

/** "Probar conexión": todos los usuarios activos, paginando. */
listUsers(creds: ZoomCredentials): Promise<ZoomUser[]>
//   GET /users?status=active&page_size=300[&next_page_token=…]

/**
 * Grabaciones en la nube de un usuario en [from, to] (fechas YYYY-MM-DD, UTC).
 * Parte el rango en tramos de ≤ 30 días y pagina cada tramo. Devuelve un
 * iterador asíncrono POR PÁGINA para que el llamador persista de a poco sin
 * transacciones largas.
 */
listUserRecordings(
  creds: ZoomCredentials,
  zoomUserId: string,
  range: { from: string; to: string }
): AsyncGenerator<ZoomRecordingMeeting[]>
//   GET /users/{userId}/recordings?from=&to=&page_size=300&trash=false[&next_page_token=]
```

Funciones puras (`links.ts`):

```ts
/** DV-008 — enlace final + si lleva el código embebido. */
buildPlayUrl(m: Pick<ZoomRecordingMeeting, "shareUrl" | "playPasscode">):
  { url: string | null; passcodeEmbedded: boolean }
//   shareUrl null            → { url: null, false }
//   shareUrl con `pwd=`      → { shareUrl, true }
//   playPasscode presente    → { shareUrl + (?|&)pwd=<encodeURIComponent>, true }
//   si no                    → { shareUrl, false }

/** Número de reunión de una URL de Zoom; null si no es reconocible. */
extractMeetingId(url: string | null): string | null
//   https://*.zoom.us/j/12345678901?pwd=…  → "12345678901"
//   https://*.zoom.us/s/12345678901        → "12345678901"
//   https://*.zoom.us/w/12345678901?…      → "12345678901"
//   vanity (/my/nombre), otra URL, null    → null
//   espacios/guiones en el número se ignoran
```

## Política de reintentos (`request()` interno)

| Respuesta | Acción |
|---|---|
| 2xx | Validar con Zod (`.passthrough()` en campos que no usamos) → mapear |
| 401 | `forgetToken` + reintentar UNA vez; si persiste → `credenciales_invalidas` |
| 429 | Esperar `Retry-After` (s) o backoff `min(2^n × 1 s, 30 s)` + jitter; máx. 3 → `limite_de_tasa` |
| 5xx / error de red / timeout 20 s | Backoff igual; máx. 3 → `zoom_caido` |
| 403 | `sin_permiso` (sin reintento) |
| 404 | `usuario_inexistente` (sin reintento) |
| otros 4xx | `respuesta_invalida` (sin reintento) |

Pedidos en SERIE por conexión, con un espaciado mínimo de 200 ms (≤ 5 req/s).

## Pruebas (unit, con `fetch` inyectado)

`tests/unit/zoom-client.test.ts`: token cacheado y renovado; Basic auth
correcta; 401 → reintento con token nuevo; 429 con `Retry-After`; tramos de
≤ 30 días para un rango de 90; paginación hasta `next_page_token` vacío;
ningún `ZoomError.message` contiene el secreto ni el token (se siembra un
secreto centinela y se busca en todos los mensajes); `buildPlayUrl` y
`extractMeetingId` por tabla.
