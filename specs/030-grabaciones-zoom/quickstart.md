# Quickstart — verificar 030 de punta a punta con mocks, y encenderla en vivo

Requisito de la Definición de Hecho reforzada: el self-test de COMPORTAMIENTO
corre verde, camino feliz y camino infeliz, sin delegar la prueba al dueño.
Los pasos 5–6 son los ÚNICOS que dependen de la cuenta real de Zoom.

## 1. Entorno local

`.env` (local, nunca producción):

```bash
WA_MOCK_ENABLED=true
# 030 — Zoom contra el mock (las credenciales se cargan por la UI/API, no acá)
ZOOM_API_BASE_URL=http://localhost:3000/api/dev/zoom-mock/v2
ZOOM_OAUTH_BASE_URL=http://localhost:3000/api/dev/zoom-mock
ZOOM_SYNC_INTERVAL_MIN=1        # para ver la periódica sin esperar una hora
ZOOM_SYNC_BACKFILL_DAYS=90
ZOOM_SYNC_OVERLAP_DAYS=3
```

`.env.example` documenta las variables `ZOOM_*` con guía inline: "dejar
`ZOOM_API_BASE_URL`/`ZOOM_OAUTH_BASE_URL` vacías en producción (usa
api.zoom.us / zoom.us)"; las credenciales de Zoom NO van en `.env`.

```bash
pnpm db:migrate   # aplica 0052 (o arrancar el contenedor)
pnpm dev
```

Con `pnpm dev` corriendo, el build va a otro directorio:
`NEXT_DIST_DIR=.next-build pnpm build`.

## 2. Gate técnico

```bash
pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-build pnpm build && pnpm test
```

Tests nuevos que deben estar en verde:

| Test | Qué garantiza |
|---|---|
| `zoom-client.test.ts` | Token S2S cacheado/renovado, 401→reintento, 429+Retry-After, tramos ≤ 30 días, paginación, secreto centinela ausente de todo error |
| `zoom-links.test.ts` | `buildPlayUrl`, `extractMeetingId` por tabla |
| `zoom-matching.test.ts` | Invariantes 1–5 del contrato de adjudicación (incl. cambio de hora, choque → ambigua) |
| `zoom-assignment.test.ts` | Manual nunca pisada por sync; auto nunca pisa `recording_source='manual'`; conflicto; desasignar limpia solo lo propio; reset |
| `zoom-sync.test.ts` | Lease: segunda corrida → 409; `synced_through` no avanza con error; upsert idempotente (2 corridas = mismas filas); ventana de recuperación |
| `zoom-adapter-guard.test.ts` | Ninguna URL/llamada a Zoom fuera de `src/lib/zoom/` |
| `zoom-secretos.test.ts` | Ninguna respuesta de `/api/settings/zoom/*` ni `/api/recordings*` contiene el secreto ni columnas `*_cipher/iv/tag` |
| `portal-grabaciones.test.ts` | Guard estructural: `student-portal.ts`/`teacher-portal.ts`/`api/portal/**` no importan `zoom_recording` |
| `rls-cobertura.test.ts` | (sin cambio) pasa con las 4 tablas nuevas |
| `route-capabilities.test.ts` | (sin cambio) pasa con las rutas nuevas |
| `tema-oscuro.test.ts` / `contraste.test.ts` | (sin cambio) la pantalla nueva usa solo tokens |

## 3. Self-test E2E (`pnpm test:e2e`)

Nueva sección `scripts/e2e/grabaciones-zoom.mjs`, registrada en
`scripts/e2e-selftest.mjs`; guion en `tests/e2e/us-grabaciones-zoom.md`.

```bash
E2E_SECCIONES=grabaciones-zoom pnpm test:e2e
```

### Preparación (por la API, como un usuario)

1. Sesión de staff con rol `direccion`.
2. Crear dos aulas ("Zoom 1" con `url` = PMI `https://zoom.us/j/1110000001`,
   "Zoom 2" con PMI `…/j/2220000002`).
3. Cohorte A (aula Zoom 1, `meeting_url` = `https://zoom.us/j/9990000001?pwd=x`,
   martes y jueves 18:30–21:30) y cohorte B (aula Zoom 2, sin `meeting_url`,
   mismo horario); generar cronogramas. Cohorte C en aula Zoom 1, mismo
   horario que A (choque deliberado), sin `meeting_url`. Pegar a mano un enlace
   de grabación en la clase 3 de A (`PATCH /api/class-sessions/{A/3}/links`).
4. Sembrar el mock (`POST /api/dev/zoom-mock/seed`, `pageSize: 2` para forzar
   paginación) con UNA cuenta `acc-1` y dos usuarios `u1`, `u2`:
   - R1: `u1`, reunión `9990000001`, inicio = clase 1 de A + 4 min → espera **asignada a A/1 (señal reunión)**.
   - R2: `u2`, reunión `2220000002` (PMI), inicio = clase 1 de B + 2 min → espera **asignada a B/1 (señal aula)**.
   - R3: `u1`, reunión `1110000001` (PMI Zoom 1), inicio = clase 2 de A/C → espera **ambigua** (A/2 y C/2).
   - R4: `u1`, reunión `9990000001`, inicio un domingo 10:00 → **sin_clase**.
   - R5: `u2`, inicio = clase 2 de B, `share_url` sin `pwd` y `recording_play_passcode: "abc123"` → `playUrl` termina en `pwd=abc123`.
   - R6: `u1`, reunión `9990000001`, inicio = clase 3 de A, que ya tiene un enlace pegado a mano → **conflicto**.

### Checks

| # | Paso | Esperado |
|---|---|---|
| 1 | `POST /api/settings/zoom/connections` con `clientSecret: "bad-…"` + `/test` | `{ok:false, error:"credenciales_invalidas"}`; status `error`; la respuesta no contiene el secreto |
| 2 | `PATCH` con secreto bueno + `/test` | lista `u1`, `u2`; GET muestra `clientSecretLast4` y nada más |
| 3 | `PUT /api/settings/zoom/rooms/{Zoom1}` → `u1`; Zoom 2 → `u2`; repetir Zoom 2 → `u1` | 200, 200, 409 `usuario_ya_vinculado` |
| 4 | `POST /api/recordings/sync` dos veces seguidas | 202, luego 409 `sync_en_curso` |
| 5 | Esperar `GET /api/recordings/sync` sin `running` | `lastRun.status = ok`, `newCount = 6` |
| 6 | `GET /api/recordings` | R1..R6 con los estados esperados; `GET /api/dev/zoom-mock/log` muestra paginación (`next_page_token`) |
| 7 | Segunda sincronización | Mismas 6 filas, mismos estados (idempotencia) |
| 8 | **Portal del alumno** de A (Playwright) | Clase 1 ofrece la grabación de R1; un alumno de B no la ve en ninguna pantalla |
| 9 | **Portal del profesor** de A | Clase 1 muestra la grabación; la clase 3 conserva el enlace manual |
| 10 | `PUT /api/recordings/R3/assignment` `{classSessionId: C/2}` → sync | `manual/asignada` a C/2 y se mantiene tras la sync |
| 11 | `DELETE /api/recordings/R1/assignment` → sync | R1 `manual/sin_clase`; A/1 ya no ofrece grabación en el portal |
| 12 | `POST /api/recordings/R1/assignment/reset` | Vuelve a A/1 (`auto/asignada`) |
| 13 | `PUT /api/recordings/R6/assignment` `{classSessionId: A/3}` sin `replace` | 409 `requiere_reemplazo`; con `replace:true` → 200 y el portal muestra R6 |
| 14 | Asignar a una clase cancelada | 422 `clase_cancelada` |
| 15 | **Camino infeliz**: `POST /api/dev/zoom-mock/fail {status:429, times:2, retryAfterSec:1}` + sync | Termina `ok` (reintentó) |
| 16 | `fail {status:500, times:10}` + sync | `lastRun.status = error`, `synced_through` sin cambio, el resto del CRM responde (GET `/api/health`, lista de clases) |
| 17 | Archivar la conexión + sync | 422 `sin_conexiones`; las grabaciones siguen listadas con `connection.archived = true` |
| 18 | **Sin Zoom**: instancia limpia | `/grabaciones` muestra el estado vacío; cargar un enlace manual en una clase funciona como antes |
| 19 | **Periódica**: sembrar R7 nueva, no tocar nada ~70 s | R7 aparece en `GET /api/recordings` |
| 20 | Usuario `soporte` | Ve `/grabaciones`, `PUT …/assignment` → 403; sin `grabaciones.ver` → ítem de menú ausente y 403 |

### UI (Playwright, `/grabaciones`)

Filtro por aula "Zoom 2" + rango de la semana → solo R2/R5; "Copiar enlace"
deja `playUrl` en el portapapeles (permiso `clipboard-read` en el contexto) y
muestra el aviso; "Ver" abre pestaña con el `playUrl`; fila ambigua destaca
y su diálogo muestra A/2 y C/2 como sugeridas. Captura en tema claro y oscuro.

## 4. Verificación técnica de producción (sin datos reales)

- `GET /api/dev/zoom-mock/*` → 404 con `NODE_ENV=production`.
- Logs del contenedor durante una sync: ningún `Authorization`, token ni secreto.

## 5. Pasos del dueño en Zoom (una vez)

Primero **averiguar la topología**: entrar a cada una de las 5 cuentas en
zoom.us → *Admin › Account Management › Account Profile* y anotar el
**Account ID**/nombre de la cuenta. Si los 5 usuarios aparecen en *User
Management › Users* de UNA cuenta → es una organización (1 app). Si cada
login es su propia cuenta → 5 cuentas (1 app en cada una).

Por cada cuenta (1 o 5 veces), con un usuario **Owner o Admin** de esa cuenta:

1. Ir a <https://marketplace.zoom.us> → *Develop › Build App* → elegir
   **Server-to-Server OAuth App** → nombre `CadIT CRM — grabaciones`.
   (Si no aparece la opción: el rol del usuario necesita el permiso
   *Server-to-Server OAuth app* en *Role Management*.)
2. **App Credentials**: copiar **Account ID**, **Client ID**, **Client Secret**.
3. **Information**: completar nombre de la empresa y correo de contacto (obligatorio para activar).
4. **Scopes** → *Add Scopes* — SOLO lectura:
   - `cloud_recording:read:list_user_recordings:admin` (listar grabaciones de un usuario)
   - `user:read:list_users:admin` (listar usuarios para vincular aulas)
   - (si la app es de las "clásicas" sin scopes granulares: `recording:read:admin` y `user:read:admin`)
   - NO agregar ningún scope de escritura, borrado, reuniones ni webhooks.
5. **Activation** → *Activate your app*.
6. Recomendado en cada cuenta: *Settings › Recording › Cloud recording* →
   activar **"Embed passcode in the shareable link for one-click access"**,
   así el enlace que reciben los alumnos abre sin pedir código (DV-008). Si no
   se activa, el CRM arma el enlace con `pwd=` igual; el paso 6 lo verifica.
7. Revisar *Settings › Recording › "Delete cloud recordings after N days"*:
   lo que Zoom borre, deja de funcionar en las clases (el CRM muestra el
   vencimiento). Decisión de la academia.

En el CRM (`/settings/zoom`, rol con `configuracion.editar`): crear una
conexión por app con esos tres valores → **Probar** → vincular cada aula a su
usuario de Zoom.

## 6. Verificación en vivo con la cuenta real (antes de dejar la periódica encendida)

1. Desplegar con `ZOOM_SYNC_INTERVAL_MIN=0` (solo botón) y sin `ZOOM_*_BASE_URL`.
2. Cargar conexión(es) → **Probar** → deben aparecer los usuarios reales.
3. Vincular SOLO un aula. Apretar **Sincronizar**. Verificar en `/grabaciones`:
   - las grabaciones de los últimos 90 días de ese usuario, con fecha/hora correcta en la zona de la academia;
   - **[verificar]** que `playUrl` abre la grabación en una ventana de incógnito **sin pedir código** (DV-008). Si pide código: registrar si `share_url` traía `pwd`, y si `recording_play_passcode` venía; ajustar `buildPlayUrl`;
   - **[verificar]** cuán atrás devuelve Zoom (la primera ventana de 90 días se completa sin errores de rango);
   - adjudicaciones automáticas razonables en 3 clases conocidas (abrir el portal de un alumno de prueba).
4. Vincular las otras aulas, sincronizar, revisar ambiguas/conflictos y resolverlos a mano.
5. Encender la periódica (`ZOOM_SYNC_INTERVAL_MIN=60`), redeploy, y al día
   siguiente confirmar que la grabación de una clase de la noche anterior quedó
   adjudicada sola (SC-004).

Pendiente de verificación humana: solo el juicio de si las adjudicaciones de
datos reales son las correctas en los casos que el matcher dejó ambiguos.
