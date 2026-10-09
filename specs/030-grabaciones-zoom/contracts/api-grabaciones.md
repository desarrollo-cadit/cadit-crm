# Contrato — rutas de API, capacidades y mock

Todas las rutas de staff usan `requireCapability(...)` (corre dentro de
`withAuth` → `withTenantTransaction`, RLS activa). Ninguna ruta de `api/portal/`
cambia ni se agrega (FR-025). `tests/unit/route-capabilities.test.ts` debe
pasar sin cambios (cada ruta nueva declara capacidad).

Cuerpos validados con Zod `.strict()`. Fechas de filtro `YYYY-MM-DD`
interpretadas en `organization.timezone` (inicio del día `from`, fin del día
`to`) y convertidas a instantes UTC.

## Grabaciones

### `GET /api/recordings` — `grabaciones.ver`

Query: `connectionId?`, `roomId?`, `from?`, `to?`, `state?` (`asignada|ambigua|conflicto|sin_clase|pendiente|faltante`), `cursor?`, `limit?` (default 50, máx. 200).

```ts
type RecordingRowDto = {
  id: string;
  connection: { id: string; name: string; archived: boolean };
  room: { id: string; name: string } | null;
  hostEmail: string | null;
  topic: string | null;
  startTime: string;            // ISO UTC; la UI lo muestra en la zona de la academia
  durationMin: number | null;
  playUrl: string | null;       // DV-008
  passcode: string | null;      // SOLO si !passcodeEmbedded; descifrado acá
  passcodeEmbedded: boolean;
  autoDeleteDate: string | null;
  missingInZoom: boolean;
  assignment: {
    mode: "auto" | "manual";
    state: "pendiente" | "asignada" | "ambigua" | "conflicto" | "sin_clase";
    classSession: { id: string; number: number; date: string; cohortId: string; cohortName: string } | null;
    candidates: { id: string; number: number; cohortName: string; startsAt: string }[]; // ambigua
    conflictWith: { id: string; number: number; cohortName: string } | null;
    assignedBy: string | null;  // nombre, no id
    assignedAt: string | null;
  };
};
// 200 → { rows: RecordingRowDto[]; nextCursor: string | null; configured: boolean }
```

`configured: false` (sin conexiones) → la UI muestra el estado vacío "Conectá
Zoom" (enlaza a `/settings/zoom` solo si la sesión tiene `configuracion.editar`).
Orden: `start_time desc, id desc` (cursor = ambos).

### `POST /api/recordings/sync` — `grabaciones.gestionar`

Body: `{ connectionId?: string }` (sin él: todas las activas).

- Toma el lease (DV-004) en transacción corta. Si no se puede →
  **409** `{ error: "sync_en_curso", startedAt }`.
- Si lo toma → crea las filas `zoom_sync_run` (`corriendo`), agenda la corrida
  con `onAfterCommit()` (la tarea abre su propio
  `withOrganizationScope(org, "system:zoom-sync")` por página), y responde
  **202** `{ runIds: string[] }`. La corrida NUNCA lanza hacia el pedido.
- Sin conexiones activas → **422** `{ error: "sin_conexiones" }`.

### `GET /api/recordings/sync` — `grabaciones.ver`

```ts
// 200
{
  running: { startedAt: string } | null;
  connections: {
    id: string; name: string; status: "sin_probar" | "ok" | "error";
    lastSyncAt: string | null; syncedThrough: string | null; lastError: string | null;
    lastRun: { status: "corriendo" | "ok" | "parcial" | "error"; startedAt: string;
               finishedAt: string | null; newCount: number; assignedCount: number;
               ambiguousCount: number; conflictCount: number } | null;
  }[];
  periodicIntervalMin: number; // 0 = apagada
}
```

La UI lo consulta cada 5 s mientras `running` ≠ null.

### `GET /api/recordings/[id]/candidates` — `grabaciones.gestionar`

Query: `q?` (texto de cohorte/curso), `date?` (`YYYY-MM-DD`, default = día de la grabación en zona de la academia).

```ts
// 200
{
  suggested: ClassOptionDto[]; // candidatas del matcher + clases reales del día en cualquier aula
  results: ClassOptionDto[];   // búsqueda por q/date, máx. 50
}
type ClassOptionDto = {
  id: string; number: number; cohortId: string; cohortName: string; courseName: string;
  startsAt: string | null; roomName: string | null;
  canceled: boolean;           // se lista, deshabilitada
  current: { kind: "manual" | "zoom"; recordingId: string | null } | null; // qué se reemplazaría
};
```

Solo clases REALES (filas de `class_session`); nunca proyecciones.

### `PUT /api/recordings/[id]/assignment` — `grabaciones.gestionar`

Body: `{ classSessionId: string; replace?: boolean }`.

| Resultado de `assignManually` | HTTP |
|---|---|
| ok | 200 `RecordingRowDto` |
| `no_existe` (grabación o clase de otra org/inexistente) | 404 |
| `clase_cancelada` | 422 `{ error: "clase_cancelada" }` |
| `sin_enlace` | 422 `{ error: "sin_enlace" }` |
| `requiere_reemplazo` | 409 `{ error: "requiere_reemplazo", current }` |

### `DELETE /api/recordings/[id]/assignment` — `grabaciones.gestionar`

Desasigna → `manual/sin_clase`. 200 `RecordingRowDto` · 404.

### `POST /api/recordings/[id]/assignment/reset` — `grabaciones.gestionar`

Vuelve a automático y re-evalúa en el acto. 200 `RecordingRowDto` · 404 ·
422 `{ error: "ya_automatica" }`.

## Conexiones de Zoom — `configuracion.editar`

### `GET /api/settings/zoom/connections`

```ts
// 200
{ connections: {
    id: string; name: string; accountId: string; clientId: string;
    clientSecretLast4: string;           // JAMÁS el secreto ni el cifrado
    status: "sin_probar" | "ok" | "error"; lastError: string | null; lastTestedAt: string | null;
    archived: boolean;
    rooms: { id: string; name: string; zoomUserId: string; zoomUserEmail: string | null }[];
  }[] }
```

### `POST /api/settings/zoom/connections`

Body: `{ name, accountId, clientId, clientSecret }` (todos requeridos, trim,
`clientSecret` 8..256). 201 conexión (forma del GET) · 409
`{ error: "cuenta_duplicada" | "nombre_duplicado" }`.

### `PATCH /api/settings/zoom/connections/[id]`

Body: `{ name?, accountId?, clientId?, clientSecret?, archived?: boolean }`.
`clientSecret` vacío/ausente = conservar. Cambiar credenciales → `status =
'sin_probar'` + `forgetToken(id)`. Archivar desvincula nada: las aulas
conservan el vínculo pero no se sincronizan. 200 · 404 · 409.

(No hay DELETE: una conexión con grabaciones se archiva.)

### `POST /api/settings/zoom/connections/[id]/test`

Llama `listUsers`. 200 `{ ok: true, users: { id, email, displayName }[] }` y
`status='ok'`; o 200 `{ ok: false, error: ZoomErrorCode, message }` y
`status='error'` (no es un fallo del CRM: es el resultado de la prueba).
Refresca `virtual_room.zoom_user_email` de las aulas vinculadas.

### `PUT /api/settings/zoom/rooms/[roomId]`

Body: `{ connectionId: string; zoomUserId: string; zoomUserEmail?: string } | { connectionId: null }`.
Vincula/desvincula un aula. Valida que la conexión sea de la org y no esté
archivada; que el aula no esté archivada; 409 `{ error: "usuario_ya_vinculado", roomName }`
si otra aula activa ya usa ese usuario de esa conexión. 200 · 404 · 409.

## Rutas existentes modificadas

| Ruta | Cambio |
|---|---|
| `PATCH /api/class-sessions/[id]/links` (`academico.editar`) | Al escribir `recordingUrl`: `recording_source = url ? 'manual' : null`. Si la clase tenía una grabación de Zoom adjudicada, esa grabación pasa a `manual/sin_clase` (una persona decidió otra cosa). |
| `PUT /api/portal/classes/[id]/recording` (`requireTeacherPortal`) | Igual. El profesor no ve grabaciones no adjudicadas: no se le agrega ningún dato. |

## Mock — `src/app/api/dev/zoom-mock/[...path]` (`mockGuard()`: 404 en producción)

| Método y ruta | Comportamiento |
|---|---|
| `POST /oauth/token?grant_type=account_credentials&account_id=X` | Basic auth: si `client_secret` empieza con `bad` → 400 `{reason:"Invalid client_id or client_secret", error:"invalid_client"}`; si no → `{access_token:"mock-<account>", token_type:"bearer", expires_in:3600, scope:"…"}` |
| `GET /v2/users` | Usuarios sembrados de esa cuenta (por token), paginados |
| `GET /v2/users/{id}/recordings?from&to&page_size&next_page_token` | Filtra por fecha; rango > 31 días → 400 `{code:300}`; usuario inexistente → 404 `{code:1001}`; pagina con `page_size` (forzable por `seed.pageSize`) |
| `POST /api/dev/zoom-mock/seed` | `{ accounts: [{ accountId, users: [{ id, email, recordings: [...] }] }], pageSize? }` — reemplaza el estado |
| `POST /api/dev/zoom-mock/fail` | `{ status: 401 \| 429 \| 500, times: number, retryAfterSec? }` — los próximos N pedidos de la API fallan así |
| `DELETE /api/dev/zoom-mock/seed` | Vacía |
| `GET /api/dev/zoom-mock/log` | Pedidos recibidos (método, ruta, query; SIN headers de auth) — el arnés verifica tramos y paginación |

Estado en `src/server/dev/zoom-mock-state.ts` (en memoria, como m365-mock).
