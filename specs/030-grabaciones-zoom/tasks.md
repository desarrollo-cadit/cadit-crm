---

description: "Lista de tareas de la feature 030 — Grabaciones de Zoom"
---

# Tasks: Grabaciones de Zoom — sección central y adjudicación automática a clases

**Input**: Documentos de diseño en `specs/030-grabaciones-zoom/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md) (DV-001..DV-013), [data-model.md](data-model.md), [contracts/](contracts/) (`zoom-adapter.md`, `adjudicacion.md`, `api-grabaciones.md`), [quickstart.md](quickstart.md)

**Tests**: SÍ. El proyecto corre **Strict TDD**: en cada fase el test se escribe primero y tiene que **nacer en rojo** antes de la implementación. Los nombres de archivo de test salen de `quickstart.md` §2 y del árbol de `plan.md`.

**Decisión del dueño ya registrada**: Q2 resuelta (2026-10-08) — **solo se sincronizan los usuarios de Zoom vinculados a un aula ACTIVA** (DV-012). Las reuniones que no son clases no entran a CadIT. Q1 (topología) y Q3 (passcode embebido) no bloquean: el diseño cubre ambas topologías y el passcode se verifica en vivo (T103).

**Organization**: tareas agrupadas por historia de usuario para que cada una se implemente y se pruebe por separado. US1–US4 son todas P1; **US4 va primero** entre ellas porque la spec la declara prerequisito ("se lista P1 porque bloquea"): sin conexión ni aulas vinculadas no hay datos que listar ni adjudicar. Después siguen en el orden de la spec: US1 → US2 → US3 (P1) → US5 → US6 (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: puede correr en paralelo (archivos distintos, sin depender de tareas incompletas)
- **[Story]**: historia a la que pertenece (US1..US6); solo en las fases de historia
- Cada tarea nombra la ruta exacta del archivo

## Path Conventions

Monolito Next.js en la raíz del repo: `src/`, `tests/unit/`, `tests/e2e/`, `scripts/e2e/`, `drizzle/`, `docs/`.

## Reglas transversales (valen para TODAS las tareas)

- **Zoom solo en `src/lib/zoom`** (constitución 1.6.0, T007): ninguna URL, token ni `fetch` a Zoom fuera del adaptador; el dominio recibe tipos y `ZoomError` propios. Solo lectura: el adaptador no tiene ningún método de escritura.
- **Tests y mocks JAMÁS llaman a Zoom real**: unit con `fetch` inyectado; E2E contra el zoom-mock tras `mockGuard()` (`src/lib/dev-guard.ts`).
- **Secretos**: Client Secret y passcode cifrados con `encryptSecret`/`decryptSecret` (`src/lib/crypto/index.ts`); solo `last4` sale; nunca en respuestas, logs ni mensajes de error.
- **Capacidades, no roles**: rutas de staff con `requireCapability(...)`; nunca `session.role === …`. Ninguna ruta nueva bajo `api/portal/` (FR-025).
- **Multi-tenancy**: toda query por `scoped()`; la sincronización abre `withOrganizationScope(org, "system:zoom-sync", fn)` corto por página; lo que lee filas recién creadas va en `onAfterCommit()` (`src/lib/db/tenant-context.ts`). Ninguna transacción abierta durante HTTP a Zoom.
- **Horarios de clase** solo vía `classInstant()` (`src/lib/schedule-time.ts`); las proyecciones nunca son adjudicables.
- **La adjudicación se proyecta sobre `class_session.recording_url`** (+ `recording_source`): `buildClassRow` y los portales no se tocan (DV-007). Un enlace pegado a mano nunca se pisa; una decisión manual nunca la deshace la sincronización.
- **Colores solo por tokens** (`tests/unit/tema-oscuro.test.ts`, `tests/unit/contraste.test.ts`); nada de `bg-token/50`.
- **Copy de UI**: voseo institucional, términos "cohorte" y "curso".

---

## Phase 1: Setup (infraestructura compartida)

**Purpose**: línea base verde, número de migración confirmado, variables de entorno y el esqueleto del arnés E2E donde cada historia suma sus checks.

- [x] T001 Correr la línea base `pnpm typecheck && pnpm lint && pnpm test` en la rama `030-grabaciones-zoom` y anotar el conteo de archivos/tests en verde en la sección "Línea base / cierre" al final de `specs/030-grabaciones-zoom/tasks.md` (referencia para detectar regresiones; no escribir código)
- [x] T002 Verificar el próximo número de migración libre AL MOMENTO DE IMPLEMENTAR: comparar `drizzle/` y `drizzle/meta/_journal.json` locales con `git fetch origin && git ls-tree --name-only origin/main drizzle/`; si `0052` ya está tomado (otra migración llegó a `main` primero), usar el siguiente libre y reemplazar `0052_grabaciones_zoom` en `specs/030-grabaciones-zoom/plan.md`, `specs/030-grabaciones-zoom/data-model.md`, `specs/030-grabaciones-zoom/quickstart.md` y `specs/030-grabaciones-zoom/tasks.md`; anotar el número confirmado en "Línea base / cierre"
- [ ] T003 [P] Documentar en `.env.example` las variables `ZOOM_API_BASE_URL`, `ZOOM_OAUTH_BASE_URL`, `ZOOM_SYNC_INTERVAL_MIN`, `ZOOM_SYNC_BACKFILL_DAYS`, `ZOOM_SYNC_OVERLAP_DAYS`, `ZOOM_MATCH_BEFORE_MIN`, `ZOOM_MATCH_AFTER_FALLBACK_MIN` con guía inline `#` ("dejar las `*_BASE_URL` vacías en producción: usa api.zoom.us / zoom.us; en local apuntar al zoom-mock"; "`ZOOM_SYNC_INTERVAL_MIN=0` apaga la periódica"; "las credenciales de Zoom NO van acá: se cargan en Configuración › Zoom") y agregar a `.env` local (append) los valores de `quickstart.md` §1
- [x] T004 [P] Escribir el guion legible `tests/e2e/us-grabaciones-zoom.md` con la preparación (pasos 1–4, grabaciones R1..R6), los 20 checks y el bloque UI de `quickstart.md` §3, cada uno con historia, paso y resultado observable
- [x] T005 [P] Crear el esqueleto de la sección E2E en `scripts/e2e/grabaciones-zoom.mjs`: `export async function seccionGrabacionesZoom({ api, ok, BASE, getCookie })` con la preparación por API de `quickstart.md` §3 pasos 1–3 (aulas Zoom 1/Zoom 2 con PMI, cohortes A/B/C con cronograma y choque A/C, enlace manual en A/3) y helpers `zoomSeed(state)` (`POST /api/dev/zoom-mock/seed`), `zoomReset()`, `zoomFail(spec)`, `zoomLog()`, `esperarSyncLibre()` (consulta `GET /api/recordings/sync` hasta `running = null`), sin checks todavía (mismo estilo que `scripts/e2e/agente-por-areas.mjs`)
- [x] T006 Registrar la sección en `scripts/e2e-selftest.mjs`: importar `seccionGrabacionesZoom`, sumarla al mapa `SECCIONES` como `"grabaciones-zoom"` y llamarla en la corrida completa junto a las otras secciones de módulo propio (depende de T005)

---

## Phase 2: Foundational (prerrequisitos bloqueantes)

**Purpose**: enmienda constitucional, datos con RLS, capacidades, adaptador `src/lib/zoom`, zoom-mock, cifrado de credenciales y guard estructural. Todo lo que comparten US1–US6.

**⚠️ CRITICAL**: ninguna historia empieza hasta cerrar esta fase. **T007 es la PRIMERA tarea de implementación**: ninguna línea que llame a Zoom antes de la enmienda.

### Enmienda (PRIMERA tarea de implementación)

- [x] T007 Enmendar `.specify/memory/constitution.md` 1.5.0 → 1.6.0 con el texto EXACTO de `plan.md` §"Enmienda planificada (T-CONST) — texto propuesto": (1) agregar el ítem 5 "Zoom (API REST v2)" a la lista de dependencias permitidas del Principio II; (2) reemplazar la viñeta del instalador; (3) reemplazar la viñeta de adaptadores (nombra `src/lib/m365` y `src/lib/zoom`); (4) reemplazar "Aislamiento de integraciones" en Restricciones de Plataforma y Seguridad; anteponer al bloque `SYNC IMPACT REPORT` el texto "Versión: 1.5.0 → 1.6.0 / Cambios (1.6.0, <fecha de implementación>) …" de plan.md; cambiar el pie a `**Version**: 1.6.0 | **Ratified**: 2026-07-09 | **Last Amended**: <fecha de implementación>`; y en `CLAUDE.md` sumar Zoom a la línea "Soberanía (II, endurecida)" (constitución 1.6.0, tras `src/lib/zoom`, solo lectura, Server-to-Server OAuth)

### Tests foundational (escribir primero, deben fallar)

- [x] T008 [P] Escribir `tests/unit/zoom-links.test.ts` por tabla (contrato `zoom-adapter.md`, DV-008): `buildPlayUrl` — `shareUrl` null → `{ url: null, passcodeEmbedded: false }`; `shareUrl` con `pwd=` → tal cual + `true`; `playPasscode` presente → agrega `?pwd=`/`&pwd=` con `encodeURIComponent` + `true`; si no → `shareUrl` + `false`; `extractMeetingId` — `/j/`, `/s/`, `/w/` en subdominios `*.zoom.us` con y sin query, espacios/guiones ignorados, vanity `/my/nombre`, URL ajena y `null` → `null`
- [x] T009 [P] Escribir `tests/unit/zoom-client.test.ts` con `fetch` inyectado: `getAccessToken` usa `POST {OAUTH_BASE}/oauth/token?grant_type=account_credentials&account_id=…` con `Authorization: Basic base64(clientId:clientSecret)`, cachea por `connectionId` hasta `expires_in − 60 s` y renueva al vencer; `forgetToken` invalida; 401 → `forgetToken` + UN reintento, si persiste `credenciales_invalidas`; 429 respeta `Retry-After` y agota en 3 → `limite_de_tasa`; 5xx/red/timeout → backoff, máx. 3 → `zoom_caido`; 403 → `sin_permiso`; 404 → `usuario_inexistente`; JSON inválido → `respuesta_invalida`; `listUserRecordings` parte 90 días en tramos de ≤ 30 días y pagina cada tramo hasta `next_page_token` vacío, entregando una página por iteración; `listUsers` pagina con `status=active&page_size=300`; espaciado ≥ 200 ms entre pedidos de la misma conexión (reloj simulado); con un secreto centinela, NINGÚN `ZoomError.message` contiene el secreto, el token ni el header `Authorization`; bases desde `ZOOM_API_BASE_URL`/`ZOOM_OAUTH_BASE_URL` con defaults `https://api.zoom.us/v2` / `https://zoom.us`
- [x] T010 [P] Escribir `tests/unit/zoom-adapter-guard.test.ts` (guard estructural, como `tests/unit/send-sandbox.test.ts`): recorre `src/` y falla si `api.zoom.us`, `zoom.us/oauth` o un `fetch(` hacia una base de Zoom aparecen fuera de `src/lib/zoom/` (excepción explícita y única: `src/app/api/dev/zoom-mock/**`, que imita a Zoom sin llamarlo); además exige que `src/lib/zoom/index.ts` exista y que ningún archivo de `src/lib/zoom/` exporte funciones con verbos de escritura (`create|update|delete|patch|post` sobre recursos de Zoom) — nace en rojo porque el adaptador no existe
- [x] T011 [P] Escribir `tests/unit/zoom-mock-state.test.ts` (contrato `api-grabaciones.md` §Mock): `seed` reemplaza el estado; token por cuenta (`mock-<account>`), `client_secret` que empieza con `bad` → `invalid_client`; `/users` paginado; `/users/{id}/recordings` filtra por `from`/`to`, rango > 31 días → 400 `{code:300}`, usuario inexistente → 404 `{code:1001}`, `pageSize` forzado pagina con `next_page_token`; `fail({status, times, retryAfterSec})` falla los próximos N pedidos de la API y después se apaga; el log registra método, ruta y query SIN headers de auth
- [x] T012 [P] Escribir `tests/unit/zoom-secretos.test.ts` (bloque foundational; US4 lo extiende en T032): `sealClientSecret("…1234")` devuelve `cipher/iv/tag` + `last4 = "1234"` y `openClientSecret` lo recupera (ida y vuelta con `ENCRYPTION_KEY` de test); `toConnectionDto(row)` no tiene ninguna clave `clientSecret`, `*_cipher`, `*_iv`, `*_tag` ni ningún valor que contenga el secreto centinela; `sealPasscode`/`openPasscode` ida y vuelta; un error de descifrado no incluye el texto cifrado
- [x] T013 [P] Actualizar `tests/unit/capabilities.test.ts` ANTES de tocar `src/lib/capabilities.ts`: `"grabaciones.ver"` y `"grabaciones.gestionar"` están en `CAPABILITIES`; `owner`/`member` tienen ambas; `soporte` tiene `grabaciones.ver` y NO `grabaciones.gestionar`; en `SYSTEM_ROLES`, `direccion` y `coordinacion` tienen ambas y `soporte` solo `.ver` (DV-009)

### Datos y llaves

- [x] T014 Agregar a `src/lib/db/schema.ts` las tablas `zoomConnection`, `zoomRecording`, `zoomSyncState`, `zoomSyncRun` con columnas, CHECKs, UNIQUEs e índices de `data-model.md` (secciones homónimas), las columnas `virtualRoom.zoomConnectionId/zoomUserId/zoomUserEmail` (con el CHECK "se vinculan juntos o ninguno") y `classSession.recordingSource` (CHECK `in ('manual','zoom')`)
- [x] T015 [P] Sumar los prefijos `zoomConnection → "zc_"`, `zoomRecording → "zr_"`, `zoomSyncRun → "zsr_"` en `src/lib/db/ids.ts`
- [x] T016 Generar con `pnpm db:generate` y ajustar a mano `drizzle/0052_grabaciones_zoom.sql` (con el número confirmado en T002; + snapshot y journal en `drizzle/meta/`): re-ejecutable (`if not exists` en tablas/índices/columnas, FKs en `do $$` contra `pg_constraint`), `enable row level security` + `drop policy if exists tenant_isolation` + `create policy tenant_isolation … using/with check (organization_id = current_setting('app.current_org', true))` ESCRITAS A MANO en las CUATRO tablas nuevas (copiar la forma exacta de `drizzle/0051_agente_por_areas.sql`; `db:generate` no las genera), UNIQUE `(organization_id, zoom_connection_id, zoom_meeting_uuid)`, UNIQUE parcial `(organization_id, class_session_id) where class_session_id is not null`, CHECK `(assignment_state = 'asignada') = (class_session_id is not null)`, UNIQUE parcial de `virtual_room (organization_id, zoom_connection_id, zoom_user_id) where zoom_user_id is not null and archived_at is null`, backfill `update class_session set recording_source = 'manual' where recording_url is not null and recording_source is null`, y backfill de capacidades en `role.capabilities` con `@>` (`direccion`, `coordinacion`: `grabaciones.ver` + `grabaciones.gestionar`; `soporte`: `grabaciones.ver`), mismo patrón que `drizzle/0050_registro_de_actividad.sql` (depende de T002, T014)
- [x] T017 Respaldar la base en `backups/vocero-pre-0052-<fecha>.sql` (mismo patrón que los respaldos 0048–0051), aplicar con `pnpm db:migrate`, re-aplicar para probar idempotencia y correr `pnpm vitest run tests/unit/rls-cobertura.test.ts` en verde con las cuatro tablas nuevas (depende de T016)
- [x] T018 [P] Agregar `"grabaciones.ver"` ("Ver las grabaciones de Zoom y copiar sus enlaces") y `"grabaciones.gestionar"` ("Sincronizar y adjudicar grabaciones a clases") a la lista cerrada de `src/lib/capabilities.ts`; excluir `grabaciones.gestionar` de `soporte` con un filtro documentado como `sinAreas` (`ROLE_CAPABILITIES.soporte` hoy es "todas menos …") y reflejarlo en `SYSTEM_ROLES`; deja verde `tests/unit/capabilities.test.ts` (depende de T013)
- [x] T019 [P] Declarar en `src/lib/env.ts` `ZOOM_API_BASE_URL` y `ZOOM_OAUTH_BASE_URL` (URL opcional, vacío = default real), `ZOOM_SYNC_INTERVAL_MIN` (entero ≥ 0, default 60), `ZOOM_SYNC_BACKFILL_DAYS` (90), `ZOOM_SYNC_OVERLAP_DAYS` (3), `ZOOM_MATCH_BEFORE_MIN` (30), `ZOOM_MATCH_AFTER_FALLBACK_MIN` (180)

### Adaptador `src/lib/zoom`

- [x] T020 [P] Crear `src/lib/zoom/types.ts` con `ZoomCredentials`, `ZoomUser`, `ZoomRecordingMeeting`, `ZoomErrorCode` y `class ZoomError` exactamente como `contracts/zoom-adapter.md` §Tipos
- [x] T021 Crear `src/lib/zoom/links.ts` con `buildPlayUrl()` y `extractMeetingId()` puras, sin red; deja verde `tests/unit/zoom-links.test.ts` (depende de T008, T020)
- [x] T022 Crear `src/lib/zoom/client.ts`: `getAccessToken`, `forgetToken`, `listUsers`, `listUserRecordings` (AsyncGenerator por página, tramos ≤ 30 días, `trash=false`), `request()` interno con la política de reintentos de `zoom-adapter.md` (Retry-After, backoff `min(2^n × 1 s, 30 s)` + jitter, timeout 20 s, serie por conexión con ≥ 200 ms), validación Zod con `.passthrough()`, mensajes de `ZoomError` propios en castellano sin secreto/token/cuerpo crudo; `fetch` y reloj inyectables para test; deja verde `tests/unit/zoom-client.test.ts` (depende de T009, T019, T020)
- [x] T023 Crear `src/lib/zoom/index.ts` (re-export de `client`, `links`, `types`); deja verde `tests/unit/zoom-adapter-guard.test.ts` (depende de T010, T021, T022)

### zoom-mock (tras `mockGuard()`)

- [x] T024 [P] Crear `src/server/dev/zoom-mock-state.ts`: estado en memoria (cuentas → usuarios → grabaciones, `pageSize`, falla programada `{status, times, retryAfterSec}`, log sin headers de auth) con `seedZoomMock`, `resetZoomMock`, `setZoomFail`, `takeZoomFail`, `readZoomLog`, `issueToken`, `listUsersFor`, `listRecordingsFor` — mismo patrón que `src/server/dev/m365-mock-state.ts`; deja verde `tests/unit/zoom-mock-state.test.ts` (depende de T011)
- [x] T025 Crear `src/app/api/dev/zoom-mock/[...path]/route.ts` tras `mockGuard()` (`src/lib/dev-guard.ts`, 404 en producción): `POST oauth/token`, `GET v2/users`, `GET v2/users/{id}/recordings` con las respuestas de `api-grabaciones.md` §Mock (incluida la forma JSON de Zoom: `meetings[]` con `uuid`, `id`, `host_id`, `topic`, `start_time`, `duration`, `share_url`, `recording_play_passcode`, `password`, `auto_delete_date`, `next_page_token`), aplicando la falla programada y anotando el log (depende de T024)
- [x] T026 [P] Crear `src/app/api/dev/zoom-mock/seed/route.ts` (`POST` reemplaza el estado, `DELETE` vacía) tras `mockGuard()` (depende de T024)
- [x] T027 [P] Crear `src/app/api/dev/zoom-mock/fail/route.ts` (`POST { status: 401|429|500, times, retryAfterSec? }`) tras `mockGuard()` (depende de T024)
- [x] T028 [P] Crear `src/app/api/dev/zoom-mock/log/route.ts` (`GET` pedidos recibidos: método, ruta, query; sin headers de auth) tras `mockGuard()` (depende de T024)

### Cifrado de credenciales

- [x] T029 Crear `src/server/zoom/connections.ts` con la capa de credenciales (US4 suma el CRUD en T034): `sealClientSecret(plain)` → `{ cipher, iv, tag, last4 }` vía `encryptSecret`; `openClientSecret(row)` vía `decryptSecret`; `loadZoomCredentials(orgId, connectionId): Promise<ZoomCredentials>` por `scoped()`; `sealPasscode`/`openPasscode`; `toConnectionDto(row)` (forma del `GET /api/settings/zoom/connections`, solo `clientSecretLast4`); deja verde `tests/unit/zoom-secretos.test.ts` (depende de T012, T014)
- [ ] T030 Checkpoint foundational: `pnpm typecheck && pnpm lint && pnpm test` en verde (incluye `rls-cobertura`, `route-capabilities`, `capabilities`, `zoom-adapter-guard`) y, con `pnpm dev` + mocks, la corrida E2E existente sin cambios (sin Zoom configurado el CRM funciona idéntico, FR-005); anotar el resultado en "Línea base / cierre" de `specs/030-grabaciones-zoom/tasks.md`

**Checkpoint**: base lista — las historias pueden empezar.

---

## Phase 3: User Story 4 — Conectar las cuentas de Zoom y vincular las aulas (Priority: P1, prerequisito)

**Goal**: dirección carga una o más conexiones Server-to-Server (Account ID, Client ID, Client Secret), las prueba, ve sus usuarios de Zoom y vincula cada aula virtual a un usuario de esa conexión; el secreto nunca vuelve completo; da igual si las 5 cuentas son una organización o cinco cuentas.

**Independent Test**: cargar una conexión contra el zoom-mock, apretar "Probar", ver la lista de usuarios, vincular un aula; verificar que ninguna respuesta trae el secreto (solo `••••last4`) y que credenciales `bad-…` dan "Zoom rechazó las credenciales" (checks 1–3 de `quickstart.md` §3).

### Tests for User Story 4 ⚠️ (escribir primero, deben fallar)

- [x] T031 [P] [US4] Escribir `tests/unit/zoom-connections.test.ts` (contrato `api-grabaciones.md` §Conexiones): esquemas Zod `.strict()` del `POST` (todos requeridos, `trim`, `clientSecret` 8..256) y del `PATCH` (`clientSecret` vacío/ausente = conservar el anterior; cambiar credenciales → `status = 'sin_probar'` + `forgetToken(id)`); `cuenta_duplicada` / `nombre_duplicado` → 409; `testConnection` con `ZoomError("credenciales_invalidas")` → `{ ok: false, error, message }` legible + `status = 'error'` + `last_error` con código propio, nunca la respuesta cruda; con éxito → usuarios + `status = 'ok'` + refresco de `virtual_room.zoom_user_email` de las aulas vinculadas; `linkRoom` rechaza conexión archivada o de otra organización, aula archivada, y devuelve `usuario_ya_vinculado` con `roomName` si otra aula activa usa ese usuario de esa conexión; `{ connectionId: null }` desvincula; las dos topologías (1 conexión × 5 usuarios, 5 conexiones × 1 usuario) pasan por el mismo código
- [x] T032 [P] [US4] Extender `tests/unit/zoom-secretos.test.ts` con las rutas: los handlers de `GET`/`POST /api/settings/zoom/connections`, `PATCH …/[id]` y `POST …/[id]/test` (invocados con sesión simulada) nunca devuelven el secreto centinela ni claves `*_cipher`/`*_iv`/`*_tag`; un `ZoomError` en `/test` no filtra el secreto en el cuerpo
- [x] T033 [US4] Agregar a `scripts/e2e/grabaciones-zoom.mjs` los checks 1–3 de `quickstart.md` §3 (crear conexión con `bad-…` + `/test` → `credenciales_invalidas`, status `error`, sin secreto en la respuesta; `PATCH` con secreto bueno + `/test` → `u1`, `u2` y `GET` solo con `clientSecretLast4`; vincular Zoom 1 → `u1`, Zoom 2 → `u2`, repetir Zoom 2 → `u1` → 409 `usuario_ya_vinculado`) — deben fallar hasta T043 (depende de T006)

### Implementation for User Story 4

- [x] T034 [US4] Extender `src/server/zoom/connections.ts` con `listConnections(orgId)` (con aulas vinculadas), `createConnection`, `updateConnection` (secreto vacío conserva; credenciales nuevas → `sin_probar` + `forgetToken`; `archived` → `archived_at`), `testConnection` (`listUsers` fuera de transacción, después persiste `status`/`last_error`/`last_tested_at` y refresca `zoom_user_email`) y `linkRoom(orgId, roomId, link | null)` con las validaciones del contrato; resultados tipados, sin 403/404 en el módulo; deja verde `tests/unit/zoom-connections.test.ts` (depende de T017, T022, T029, T031)
- [x] T035 [P] [US4] Crear `src/app/api/settings/zoom/connections/route.ts`: `GET` y `POST` con `requireCapability("configuracion.editar")`, cuerpo con `parseBody` + Zod, 201/409 según contrato (depende de T034)
- [x] T036 [P] [US4] Crear `src/app/api/settings/zoom/connections/[id]/route.ts`: `PATCH` con `requireCapability("configuracion.editar")`, 200/404/409; sin `DELETE` (una conexión con grabaciones se archiva) (depende de T034)
- [x] T037 [P] [US4] Crear `src/app/api/settings/zoom/connections/[id]/test/route.ts`: `POST` con `requireCapability("configuracion.editar")` → 200 `{ ok: true, users }` o 200 `{ ok: false, error, message }` (depende de T034)
- [x] T038 [P] [US4] Crear `src/app/api/settings/zoom/rooms/[roomId]/route.ts`: `PUT` con `requireCapability("configuracion.editar")`, body `{ connectionId, zoomUserId, zoomUserEmail? } | { connectionId: null }`, 200/404/409 `usuario_ya_vinculado` (depende de T034)
- [x] T039 [P] [US4] Modificar `src/server/virtual-rooms.ts`: el DTO de aula de staff incluye el vínculo Zoom (`zoomConnectionId`, `zoomUserId`, `zoomUserEmail`); archivar un aula NO borra el vínculo (deja de sincronizarse por DV-012)
- [x] T040 [P] [US4] Sumar en `src/lib/nav.ts` la entrada Configuración › Zoom (`/settings/zoom`, capacidad `configuracion.editar`)
- [x] T041 [US4] Crear `src/components/settings/zoom-connections-client.tsx`: lista de conexiones (nombre, Account ID, Client ID, secreto como `••••last4`, estado, último error legible, archivada), alta/edición (campo de secreto vacío = conservar), botón "Probar" con la lista de usuarios, y vínculo aula ↔ usuario de esa conexión (selector poblado con el resultado de "Probar"); colores solo por tokens, copy en voseo (depende de T035, T036, T037, T038)
- [x] T042 [US4] Crear `src/app/(app)/settings/zoom/page.tsx` (server component: sesión + `configuracion.editar` → `ZoomConnectionsClient`, aulas activas desde `src/server/virtual-rooms.ts`) (depende de T039, T041)
- [x] T043 [US4] Verificar US4: `pnpm vitest run tests/unit/zoom-connections.test.ts tests/unit/zoom-secretos.test.ts tests/unit/route-capabilities.test.ts tests/unit/tema-oscuro.test.ts` en verde y, con `pnpm dev` + zoom-mock, `E2E_SECCIONES=grabaciones-zoom pnpm test:e2e` con los checks 1–3 en verde; captura de `/settings/zoom` en tema claro y oscuro

**Checkpoint**: hay conexiones probadas y aulas vinculadas contra el mock.

---

## Phase 4: User Story 1 — Ver todas las grabaciones en un solo lugar (Priority: P1) 🎯 MVP

**Goal**: el botón "Sincronizar" trae las grabaciones en la nube de los usuarios vinculados a aulas activas (Q2) con upsert idempotente, lease de una corrida por organización y ventana de recuperación; `/grabaciones` las lista con aula, cuenta, inicio en la zona de la academia, duración, tema y estado, con filtros, "Copiar enlace", "Ver" y código de acceso cuando no viene embebido.

**Independent Test**: con dos aulas vinculadas y grabaciones sembradas en `u1` y `u2`, sincronizar y verificar que la tabla las muestra todas (más recientes primero), que los filtros por aula y fechas recortan bien y que "Copiar enlace" deja el `playUrl` en el portapapeles (checks 4–6 y 17 + bloque UI de `quickstart.md` §3). En esta fase las grabaciones quedan `pendiente`: adjudicar llega en US2.

### Tests for User Story 1 ⚠️ (escribir primero, deben fallar)

- [x] T044 [P] [US1] Escribir `tests/unit/zoom-sync.test.ts` (DV-004, DV-012, DV-013): `acquireLease` en una org con lease vigente → `{ ok: false, startedAt }`; vencido → lo toma; `renewLease`/`releaseLease`; ventana `from = (synced_through ?? hoy − BACKFILL) − OVERLAP`, `to = hoy` (UTC, día); `synced_through` avanza solo si TODAS las aulas de la conexión terminaron bien y no cambia con un error; solo se consultan aulas ACTIVAS vinculadas de conexiones NO archivadas (Q2); el upsert por `(org, connection, zoom_meeting_uuid)` corrido dos veces deja las mismas filas (`first_seen_at` fijo, `last_seen_at` actualizado); `play_url` y passcode cifrado salen de `buildPlayUrl`; el fallo de un aula deja la corrida `parcial` con el error de esa aula y las demás procesadas; grabación dentro de la ventana de un aula OK que no apareció → `missing_in_zoom_at`; si reaparece se limpia; poda a 200 corridas por conexión; ninguna excepción escapa de `runSync`
- [x] T045 [P] [US1] Escribir `tests/unit/zoom-recordings.test.ts` (contrato `GET /api/recordings`): filtros `connectionId`, `roomId`, `from`/`to` (`YYYY-MM-DD` en `organization.timezone`, inicio del día `from` a fin del día `to`, inclusive), `state` (incluido `faltante` = `missing_in_zoom_at` no nulo); orden `start_time desc, id desc` con cursor estable; `limit` default 50, máx. 200; DTO `RecordingRowDto` exacto (passcode descifrado SOLO si `!passcodeEmbedded`; `assignedBy` como nombre; `connection.archived`); `configured: false` sin conexiones
- [x] T046 [US1] Agregar a `scripts/e2e/grabaciones-zoom.mjs` el sembrado del mock de `quickstart.md` §3 paso 4 (cuenta `acc-1`, `u1`/`u2`, R1..R6, `pageSize: 2`) y los checks 4 (`POST /api/recordings/sync` dos veces → 202 y 409 `sync_en_curso`), 5 (`lastRun.status = ok`, `newCount = 6`), 6 parcial (las 6 filas presentes; `zoomLog()` muestra `next_page_token`; R5 con `playUrl` terminado en `pwd=abc123`) y 17 (archivar la conexión + sync → 422 `sin_conexiones`; las filas siguen con `connection.archived = true`; desarchivar al terminar) — deben fallar hasta T057 (depende de T033)

### Implementation for User Story 1

- [x] T047 [US1] Crear `src/server/zoom/lease.ts`: `acquireLease(orgId, owner)` (`UPDATE … WHERE lease_until IS NULL OR lease_until < now() RETURNING`, insertando la fila de `zoom_sync_state` si no existe, transacción corta, 15 min), `renewLease`, `releaseLease`, `currentRun(orgId)` → `{ startedAt } | null`
- [x] T048 [US1] Crear `src/server/zoom/sync.ts` con `runSync(orgId, trigger, { connectionId?, userId? })`: toma el lease, crea filas `zoom_sync_run` (`corriendo`), por conexión activa y por aula activa vinculada calcula la ventana, itera `listUserRecordings` FUERA de transacción y persiste cada página en su propio `withOrganizationScope(org, "system:zoom-sync")` corto (upsert, `buildPlayUrl`, `sealPasscode`, `last_seen_at`), marca `missing_in_zoom_at` (DV-013), renueva el lease por aula, avanza `synced_through` solo si todas las aulas terminaron bien, cierra cada corrida (`ok|parcial|error`, contadores, error propio sin datos sensibles), actualiza `last_sync_at`, poda a 200 y libera el lease; nunca lanza; deja un punto de extensión `afterPage(rows)` que US2 usa para adjudicar; deja verde `tests/unit/zoom-sync.test.ts` (depende de T044, T047, T022, T029, T017)
- [x] T049 [US1] Crear `src/server/zoom/recordings.ts` con `listRecordings(orgId, filters)` (filtros, cursor, DTO `RecordingRowDto` completo incluidos `assignment.classSession`, `candidates` y `conflictWith` resueltos con una sola consulta por página, passcode descifrado solo si no está embebido) y `getSyncStatus(orgId)` (forma del `GET /api/recordings/sync`, `periodicIntervalMin` desde env); deja verde `tests/unit/zoom-recordings.test.ts` (depende de T045, T017, T029)
- [x] T050 [P] [US1] Crear `src/app/api/recordings/route.ts`: `GET` con `requireCapability("grabaciones.ver")`, query validada con Zod, 200 `{ rows, nextCursor, configured }` (depende de T049)
- [x] T051 [US1] Crear `src/app/api/recordings/sync/route.ts`: `GET` con `requireCapability("grabaciones.ver")` → `getSyncStatus`; `POST` con `requireCapability("grabaciones.gestionar")`, body `{ connectionId? }`: sin conexiones activas → 422 `sin_conexiones`; lease ocupado → 409 `{ error: "sync_en_curso", startedAt }`; si lo toma → 202 `{ runIds }` y agenda `runSync(org, "manual", …)` con `onAfterCommit()`; la corrida nunca lanza hacia el pedido (depende de T048, T049)
- [x] T052 [P] [US1] Sumar en `src/lib/nav.ts` el ítem "Grabaciones" (`/grabaciones`) en Gestión con capacidad `grabaciones.ver` (sin la capacidad el ítem no aparece)
- [x] T053 [P] [US1] Crear `src/components/recordings/recording-row-actions.tsx` con "Copiar enlace" (`navigator.clipboard.writeText(playUrl)` + aviso de copia), "Ver" (`target="_blank" rel="noopener noreferrer"`, el CRM no reproduce ni intermedia), y el código de acceso con su propio botón de copiar cuando `passcode` viene (no embebido); deshabilitado con explicación si `playUrl` es null ("Zoom todavía no dio el enlace"); colores solo por tokens
- [x] T054 [US1] Crear `src/components/recordings/recordings-client.tsx`: tabla (aula, cuenta, inicio en la zona de la academia, duración, tema, estado de adjudicación, clase/cohorte, vencimiento, "ya no está en Zoom"), filtros por conexión, aula, rango de fechas y estado, paginación por cursor, botón "Sincronizar" (solo con `grabaciones.gestionar`; 409 → "ya hay una sincronización corriendo desde …"), y estado vacío "Conectá Zoom" con enlace a `/settings/zoom` solo si la sesión tiene `configuracion.editar`; densidad del panel de staff, colores solo por tokens (depende de T050, T051, T053)
- [x] T055 [US1] Crear `src/app/(app)/grabaciones/page.tsx` (server component: sesión + `sessionCapabilities(session).includes("grabaciones.ver")` o 403, timezone de la organización y capacidades → `RecordingsClient`) (depende de T054)
- [x] T056 [US1] Agregar a `scripts/e2e/grabaciones-zoom.mjs` el bloque UI con Playwright sobre `/grabaciones`: filtro aula "Zoom 2" + rango de la semana → solo R2/R5; "Copiar enlace" con permiso `clipboard-read` deja `playUrl` y muestra el aviso; "Ver" abre pestaña con `playUrl`; capturas en tema claro y oscuro (depende de T046, T055)
- [x] T057 [US1] Verificar US1: `pnpm vitest run tests/unit/zoom-sync.test.ts tests/unit/zoom-recordings.test.ts tests/unit/route-capabilities.test.ts tests/unit/tema-oscuro.test.ts tests/unit/contraste.test.ts` en verde y `E2E_SECCIONES=grabaciones-zoom pnpm test:e2e` con los checks 1–6, 17 y el bloque UI (sin estados de adjudicación) en verde

**Checkpoint**: MVP — las grabaciones de todas las cuentas en una tabla, con enlace copiable, sin entrar a Zoom.

---

## Phase 5: User Story 2 — Adjudicación automática a la clase (Priority: P1)

**Goal**: al sincronizar, cada grabación se adjudica sola a la ÚNICA clase real, no cancelada, con horario, cuya reunión (clase → cohorte) tenga el mismo número —o, si no, cuya aula esté hospedada por el anfitrión— dentro de la tolerancia; la ambigüedad no se adivina; un enlace manual nunca se pisa (conflicto); la clase ofrece la grabación por `recording_url` en los mismos canales de hoy.

**Independent Test**: con R1..R6 sembradas, sincronizar y verificar R1 asignada a A/1 (reunión), R2 a B/1 (aula), R3 ambigua (A/2 y C/2), R4 sin clase, R6 en conflicto con el enlace manual de A/3; una segunda sincronización no cambia nada (checks 6 y 7).

### Tests for User Story 2 ⚠️ (escribir primero, deben fallar)

- [x] T058 [P] [US2] Escribir `tests/unit/zoom-matching.test.ts` (contrato `adjudicacion.md`, invariantes 1–5): señal A (número de reunión) gana sobre B aunque el anfitrión sea otro usuario (cuenta prestada); dos candidatas igual de válidas → `ambigua`, nunca "la más cercana"; bordes de ventana inclusive (`startsAt − beforeMin` y `endsAt ?? startsAt + afterFallbackMin`); semana del cambio de hora en `America/Santiago` y en `America/Montevideo` con instantes generados por `classInstant`; determinismo ante permutaciones de `classes`; PMI del aula (`pmiMeetingId`) cuenta como aula del anfitrión; y para `loadMatchContext`: clases canceladas, sin `start_time` y proyecciones (sin fila de `class_session`) NO se cargan, aula efectiva = clase → cohorte, reunión efectiva vía `resolveMeetingUrl` + `extractMeetingId`, una sola carga por página
- [x] T059 [P] [US2] Escribir `tests/unit/zoom-assignment.test.ts` (bloque `applyMatch`): `manual/*` no se toca; `auto/asignada` es estable (no se mueve a otra clase); `unica` sobre clase con `recording_source = 'manual'` y enlace → `conflicto` + `conflict_class_session_id`, sin tocar la clase; `unica` sobre clase que ya tiene otra grabación adjudicada (reunión reiniciada) → `conflicto`; `play_url` null → `pendiente`; caso feliz → `class_session.recording_url = play_url`, `recording_source = 'zoom'`, `assigned_at`; `ninguna` → `sin_clase` con candidatas vacías; `ambigua` → candidatas guardadas; `clearClassIfOwned` limpia solo si `recording_source = 'zoom'` y `recording_url = play_url`; `releaseForManualLink(classId)` (R6) pasa la grabación de Zoom de esa clase a `manual/sin_clase`
- [x] T060 [P] [US2] Escribir `tests/unit/recording-url-escrituras.test.ts` (guard estructural, riesgo R7): las únicas escrituras a `recordingUrl`/`recording_url` en `src/` están en `src/app/api/class-sessions/[id]/links/route.ts`, `src/app/api/portal/classes/[id]/recording/route.ts` y `src/server/zoom/assignment.ts`, y las dos rutas escriben también `recordingSource`
- [x] T061 [US2] Completar en `scripts/e2e/grabaciones-zoom.mjs` el check 6 (estados esperados de R1..R6 con su clase/candidatas/conflicto) y el check 7 (segunda sincronización: mismas 6 filas, mismos estados); verificar además por `GET /api/cohorts/{A}/classes` que A/1 ofrece la grabación de R1 y A/3 conserva el enlace manual — deben fallar hasta T070 (depende de T046)

### Implementation for User Story 2

- [x] T062 [US2] Crear `src/server/zoom/matching.ts` con `matchRecording(input)` puro (tipos `MatchableClass`, `MatchableRoom`, `MatchInput`, `MatchResult` de `adjudicacion.md`) y `loadMatchContext(orgId, { from, to })` (clases con `date` en `[from − 1 día, to + 1 día]`, no canceladas, con `start_time`, instantes SOLO con `classInstant(..., organization.timezone)`, aulas activas vinculadas, tolerancia desde `ZOOM_MATCH_*`); deja verde `tests/unit/zoom-matching.test.ts` (depende de T058, T021, T017)
- [x] T063 [US2] Crear `src/server/zoom/assignment.ts` con `applyMatch(orgId, recording, context)` (algoritmo de "Persistencia" de `adjudicacion.md`, `pg_advisory_xact_lock(hashtext('rec:' || classId))` + `select … for update` de la clase), `clearClassIfOwned(tx, recording)` y `releaseForManualLink(tx, orgId, classSessionId)`; deja verde el bloque `applyMatch` de `tests/unit/zoom-assignment.test.ts` (depende de T059, T062)
- [x] T064 [US2] Cablear la adjudicación en `src/server/zoom/sync.ts` vía `afterPage`: por página, `loadMatchContext` una vez y `applyMatch` a cada grabación `auto` no `asignada` (incluye re-evaluar `pendiente`/`ambigua`/`conflicto`/`sin_clase` vistas en la ventana), sumando `assigned_count`/`ambiguous_count`/`conflict_count` a la corrida (depende de T048, T063)
- [x] T065 [P] [US2] Modificar `src/app/api/class-sessions/[id]/links/route.ts`: al escribir `recordingUrl` → `recordingSource = url ? 'manual' : null`, y si la clase tenía una grabación de Zoom adjudicada llamar `releaseForManualLink` en la misma transacción (una persona decidió otra cosa) (depende de T063)
- [x] T066 [P] [US2] Modificar `src/app/api/portal/classes/[id]/recording/route.ts` igual que T065, sin agregar ningún dato nuevo a la respuesta del profesor (depende de T063)
- [x] T067 [P] [US2] Modificar `src/server/classes.ts`: la fila de staff (`StaffClassRowDto`) expone `recordingSource`; `buildClassRow` y el DTO de portal SIN cambios
- [x] T068 [US2] Modificar `src/components/cohorts/classes-client.tsx`: chip "Zoom" / "manual" junto a la grabación de la clase y aviso al editar a mano una grabación que vino de Zoom ("vas a reemplazar la grabación de Zoom"); colores solo por tokens (depende de T067)
- [x] T069 [US2] Sumar a `src/components/recordings/recordings-client.tsx` los chips de estado de adjudicación (automática, manual, ambigua, en conflicto, sin clase, sin clase-manual, pendiente), la fila ambigua destacada con sus candidatas y la fila en conflicto con la clase en disputa; solo tokens (depende de T054)
- [x] T070 [US2] Verificar US2: `pnpm vitest run tests/unit/zoom-matching.test.ts tests/unit/zoom-assignment.test.ts tests/unit/recording-url-escrituras.test.ts tests/unit/zoom-sync.test.ts tests/unit/tema-oscuro.test.ts` en verde y `E2E_SECCIONES=grabaciones-zoom pnpm test:e2e` con los checks 1–7 en verde

**Checkpoint**: la grabación llega sola a la clase; lo dudoso queda señalado, no adivinado.

---

## Phase 6: User Story 3 — Adjudicar y desadjudicar a mano (Priority: P1)

**Goal**: coordinación asigna una grabación a cualquier clase real no cancelada de cualquier cohorte (con sugeridas primero y búsqueda), la desasigna o la devuelve a automático; ninguna sincronización deshace una decisión manual; reemplazar avisa qué se pisa.

**Independent Test**: tomar R3 (ambigua), asignarla a C/2, sincronizar → sigue en C/2; desasignar R1, sincronizar → sigue sin clase; "volver a automático" → vuelve a A/1; asignar R6 a A/3 sin `replace` → 409, con `replace` → 200; clase cancelada → 422 (checks 10–14).

### Tests for User Story 3 ⚠️ (escribir primero, deben fallar)

- [x] T071 [P] [US3] Extender `tests/unit/zoom-assignment.test.ts` con las operaciones manuales (tabla de `adjudicacion.md`): `assignManually` → `no_existe` (grabación o clase de otra org), `clase_cancelada`, `sin_enlace`, `requiere_reemplazo` con `current: { kind: "manual" | "zoom", recordingId? }`; con `replace: true` la otra grabación pasa a `manual/sin_clase`, la clase anterior de ESTA grabación se limpia si era suya, y `rec` queda `manual/asignada` con `assigned_by`/`assigned_at`; `unassign` → `manual/sin_clase` y limpia solo lo propio; `resetToAuto` exige `manual` (si no `ya_automatica`), limpia, pasa a `auto/pendiente` y re-evalúa en el acto; locks en orden de id; una sincronización posterior no modifica ninguna grabación `manual` (SC-005)
- [x] T072 [P] [US3] Escribir `tests/unit/zoom-candidates.test.ts` para `listCandidates(orgId, recId, { q, date })`: `suggested` = candidatas del matcher + clases reales del día de la grabación (zona de la academia) en cualquier aula; `results` por cohorte/curso (`q`) y `date`, máx. 50; nunca proyecciones; las canceladas se listan con `canceled: true`; `current` indica qué se reemplazaría
- [x] T073 [US3] Agregar a `scripts/e2e/grabaciones-zoom.mjs` los checks 10–14 de `quickstart.md` §3 y, en el bloque UI, que el diálogo de la fila ambigua muestre A/2 y C/2 como sugeridas — deben fallar hasta T081 (depende de T061)

### Implementation for User Story 3

- [x] T074 [US3] Agregar a `src/server/zoom/assignment.ts` `assignManually(org, recId, classId, { replace, userId })`, `unassign(org, recId, userId)` y `resetToAuto(org, recId)` con resultados tipados (`no_existe`, `clase_cancelada`, `sin_enlace`, `requiere_reemplazo`, `ya_automatica`) y `pg_advisory_xact_lock` sobre las clases involucradas en orden de id; deja verde `tests/unit/zoom-assignment.test.ts` (depende de T063, T071)
- [x] T075 [US3] Agregar `listCandidates()` a `src/server/zoom/recordings.ts` (forma `ClassOptionDto` del contrato); deja verde `tests/unit/zoom-candidates.test.ts` (depende de T049, T062, T072)
- [x] T076 [P] [US3] Crear `src/app/api/recordings/[id]/candidates/route.ts`: `GET` con `requireCapability("grabaciones.gestionar")`, query `q?`, `date?` (depende de T075)
- [x] T077 [P] [US3] Crear `src/app/api/recordings/[id]/assignment/route.ts`: `PUT { classSessionId, replace? }` y `DELETE` con `requireCapability("grabaciones.gestionar")`, mapeo de resultados a 200 `RecordingRowDto` / 404 / 422 / 409 según `api-grabaciones.md` (depende de T074)
- [x] T078 [P] [US3] Crear `src/app/api/recordings/[id]/assignment/reset/route.ts`: `POST` con `requireCapability("grabaciones.gestionar")` → 200 `RecordingRowDto` / 404 / 422 `ya_automatica` (depende de T074)
- [x] T079 [US3] Crear `src/components/recordings/assign-dialog.tsx`: sugeridas primero, búsqueda por cohorte y fecha, canceladas deshabilitadas, y ante 409 `requiere_reemplazo` un aviso que dice qué se reemplaza (enlace manual u otra grabación) y confirma con `replace: true`; solo tokens (depende de T076, T077)
- [x] T080 [US3] Sumar a `src/components/recordings/recording-row-actions.tsx` las acciones "Asignar a clase" (abre `AssignDialog`), "Desasignar" y "Volver a automático", visibles solo con `grabaciones.gestionar` (depende de T078, T079)
- [x] T081 [US3] Verificar US3: `pnpm vitest run tests/unit/zoom-assignment.test.ts tests/unit/zoom-candidates.test.ts tests/unit/route-capabilities.test.ts` en verde y `E2E_SECCIONES=grabaciones-zoom pnpm test:e2e` con los checks 1–7 y 10–14 + el diálogo de sugeridas en verde

**Checkpoint**: todo caso que la automática no resuelve tiene salida en un clic, y se respeta.

---

## Phase 7: User Story 5 — Sincronización a demanda y periódica (Priority: P2)

**Goal**: además del botón, el servidor sincroniza solo cada `ZOOM_SYNC_INTERVAL_MIN` (0 la apaga), con una sola corrida por organización aun con dos procesos, recuperación tras días apagado, reintentos ante 429/5xx aislados por conexión, y la pantalla muestra la última corrida de cada conexión y "corriendo desde…".

**Independent Test**: con intervalo de 1 minuto, sembrar R7 y verla aparecer sin tocar nada; 429 ×2 → la corrida termina `ok`; 500 ×10 → `error` sin mover `synced_through` y el resto del CRM responde; dos procesos contra la misma base → una sola corrida (checks 15, 16 y 19).

### Tests for User Story 5 ⚠️ (escribir primero, deben fallar)

- [x] T082 [P] [US5] Escribir `tests/unit/zoom-scheduler.test.ts` con temporizadores simulados: `ZOOM_SYNC_INTERVAL_MIN=0` → no arranca; con intervalo, el tick enumera organizaciones con al menos una conexión activa (lectura barata) y llama `runSync(org, "periodica")` en cada una dentro de su alcance; el `setInterval` queda `unref()`; un tick que falla o encuentra el lease ocupado no lanza ni detiene los siguientes; arrancar dos veces no duplica el temporizador
- [x] T083 [P] [US5] Extender `tests/unit/zoom-sync.test.ts`: `recoverZoomSyncOnBoot()` pasa las `zoom_sync_run` `corriendo` huérfanas a `error` ("Interrumpida por un reinicio") y libera leases vencidos; servidor apagado 3 días → la ventana siguiente cubre esos días sin huecos; 429 transitorio recuperado → `ok`; 5xx persistente en una conexión → esa `error` y la otra `ok` en la misma corrida
- [x] T084 [US5] Agregar a `scripts/e2e/grabaciones-zoom.mjs` los checks 15 (`fail {429, times: 2, retryAfterSec: 1}` + sync → `ok`), 16 (`fail {500, times: 10}` + sync → `lastRun.status = error`, `syncedThrough` sin cambio, `GET /api/health` y la lista de clases responden) y 19 (sembrar R7, esperar ~70 s sin tocar nada con `ZOOM_SYNC_INTERVAL_MIN=1` → R7 en `GET /api/recordings`; se salta con aviso si la app corre con el intervalo en 0) — deben fallar hasta T090 (depende de T073)

### Implementation for User Story 5

- [x] T085 [US5] Crear `src/server/zoom/scheduler.ts` con `startZoomScheduler()`: `setInterval(...).unref()` cada `ZOOM_SYNC_INTERVAL_MIN`, idempotente, enumera organizaciones con conexiones activas y llama `runSync(org, "periodica")` (que toma el lease y sale si está ocupado); nunca lanza; deja verde `tests/unit/zoom-scheduler.test.ts` (depende de T048, T082)
- [x] T086 [US5] Agregar `recoverZoomSyncOnBoot()` a `src/server/zoom/sync.ts` (huérfanas → `error`, leases vencidos liberados) y llamarla junto con `startZoomScheduler()` desde `src/instrumentation-node.ts`, cableado en `src/instrumentation.ts` igual que la limpieza de corridas del Laboratorio; deja verde `tests/unit/zoom-sync.test.ts` (depende de T083, T085)
- [x] T087 [P] [US5] Crear `src/components/recordings/sync-status.tsx`: última corrida por conexión (cuándo, resultado, nuevas, adjudicadas, ambiguas, conflictos, error legible), "corriendo desde HH:MM" mientras `running` ≠ null consultando `GET /api/recordings/sync` cada 5 s, e intervalo de la periódica ("cada 60 min" / "apagada"); solo tokens
- [x] T088 [US5] Montar `SyncStatus` en `src/components/recordings/recordings-client.tsx` y refrescar la tabla cuando una corrida pasa de `corriendo` a terminada (depende de T087, T069)
- [x] T089 [US5] Prueba con dos procesos (riesgo R5): `NEXT_DIST_DIR=.next-build pnpm build` y `pnpm start` en dos puertos contra la misma base con `ZOOM_SYNC_INTERVAL_MIN=1`; tras 3 ticks, contar en `zoom_sync_run` una sola corrida por tick y conexión; registrar el resultado en la sección "Línea base / cierre" de `specs/030-grabaciones-zoom/tasks.md` (depende de T086)
- [x] T090 [US5] Verificar US5: `pnpm vitest run tests/unit/zoom-scheduler.test.ts tests/unit/zoom-sync.test.ts` en verde y `E2E_SECCIONES=grabaciones-zoom pnpm test:e2e` con los checks 1–7, 10–17 y 19 en verde

**Checkpoint**: la grabación de anoche aparece a la mañana sin que nadie toque nada.

---

## Phase 8: User Story 6 — Profesores y alumnos ven solo lo suyo (Priority: P2)

**Goal**: el alumno y el profesor ven la grabación adjudicada donde siempre (lista de clases de su portal), y ninguna ruta de portal devuelve grabaciones no adjudicadas a una clase de su alcance; el profesor sigue pudiendo pegar su enlace y la sincronización no lo pisa. No se crea ninguna ruta de portal nueva.

**Independent Test**: tras la adjudicación automática de R1 a A/1, el alumno de A la ve en la clase 1; un alumno de B y un profesor ajeno no la ven en ninguna ruta; el enlace manual de A/3 sigue en el portal del profesor (checks 8 y 9).

### Tests for User Story 6 ⚠️ (escribir primero, deben fallar)

- [x] T091 [P] [US6] Escribir `tests/unit/portal-grabaciones.test.ts` (guard estructural, como `tests/unit/student-portal.test.ts`): `src/server/student-portal.ts`, `src/server/teacher-portal.ts`, `src/lib/portal-api.ts` y todo `src/app/api/portal/**` no importan `zoomRecording`/`zoom_recording` ni `src/server/zoom/*` (salvo `assignment.releaseForManualLink` en `src/app/api/portal/classes/[id]/recording/route.ts`); no hay rutas nuevas bajo `src/app/api/portal/` respecto de la lista conocida; la respuesta del portal sigue sin `recordingSource`
- [x] T092 [US6] Agregar a `scripts/e2e/grabaciones-zoom.mjs` los checks 8 y 9 con Playwright: portal del alumno de A → la clase 1 ofrece la grabación de R1; alumno de B → no aparece en ninguna pantalla ni en `GET /api/portal/me/*`; portal del profesor de A → clase 1 con la grabación y clase 3 con el enlace manual; el profesor pega un enlace nuevo en una clase con grabación de Zoom → gana el suyo, la grabación pasa a `manual/sin_clase`, y una sincronización posterior no lo pisa (escenario US6-3, riesgo R6) (depende de T084)

### Implementation for User Story 6

- [x] T093 [US6] Revisar `src/server/student-portal.ts` y `src/server/teacher-portal.ts` contra T091/T092: confirmar que `recordingUrl` ya respeta la cancelación (FR-005e de 013) y el alcance (cohorte ∪ suplencia); si el guard o el E2E muestran una fuga, corregirla en ese archivo SIN agregar datos nuevos al portal (esperado: sin cambios, DV-007) (depende de T091)
- [x] T094 [US6] Verificar US6: `pnpm vitest run tests/unit/portal-grabaciones.test.ts tests/unit/student-portal.test.ts tests/unit/route-capabilities.test.ts` en verde y `E2E_SECCIONES=grabaciones-zoom pnpm test:e2e` con los checks 1–17 y 19 en verde

**Checkpoint**: todas las historias funcionan de punta a punta contra los mocks.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: documentación, guía, cierre del arnés E2E, gate completo, corrida completa sobre base limpia y encendido en vivo con la cuenta real.

- [x] T095 [P] Agregar a la tabla "Mapa del código" de `CLAUDE.md` la fila "Grabaciones de Zoom" (`src/lib/zoom/` adaptador único + `src/server/zoom/` + `/grabaciones` + `/settings/zoom` + `/api/recordings*` + `/api/settings/zoom/*`) y una nota breve: Zoom solo en `src/lib/zoom` (guard), solo lectura, adjudicación proyectada sobre `class_session.recording_url` + `recording_source`, manual nunca pisada, lease en `zoom_sync_state`, `ZOOM_SYNC_INTERVAL_MIN=0` apaga la periódica, constitución 1.6.0
- [x] T096 [P] Sumar a la guía por rol en `src/lib/guia.ts` las entradas de Grabaciones (`grabaciones.ver`: ver y copiar; `grabaciones.gestionar`: sincronizar y adjudicar) y de Configuración › Zoom (`configuracion.editar`), y ajustar `tests/unit/guia.test.ts` si enumera entradas
- [x] T097 [P] Documentar en `DESIGN.md` la tabla de grabaciones y los chips de estado de adjudicación / origen "Zoom"–"manual" con los tokens existentes (si no agrega nada nuevo al sistema, dejar constancia de que reusa los chips actuales)
- [x] T098 Cerrar la sección E2E en `scripts/e2e/grabaciones-zoom.mjs`: checks 18 (instancia sin conexiones → `/grabaciones` con estado vacío y enlace manual en una clase funcionando como antes) y 20 (usuario `soporte` ve `/grabaciones` pero `PUT …/assignment` → 403; usuario sin `grabaciones.ver` → ítem de menú ausente y 403), y confirmar que los 20 checks + el bloque UI están en el arnés y en `tests/e2e/us-grabaciones-zoom.md`; la sección deja el zoom-mock limpio al salir (`DELETE /api/dev/zoom-mock/seed`, falla apagada)
- [x] T099 Gate técnico completo: `pnpm typecheck && pnpm lint && pnpm test` y `NEXT_DIST_DIR=.next-build pnpm build` (con `pnpm dev` corriendo) en verde; re-confirmar que el número de migración de T002 sigue libre en `origin/main` antes de cerrar; corregir y re-correr hasta verde
- [ ] T100 Self-test E2E completo en vivo con mocks (`WA_MOCK_ENABLED=true`, `META_GRAPH_BASE_URL` → wa-mock, `OPENROUTER_BASE_URL` → ai-mock, `M365_*_BASE_URL` → m365-mock, `ZOOM_*_BASE_URL` → zoom-mock) sobre una `vocero_e2e` RECREADA desde cero (todas las migraciones, incluida la de esta fase): `node --env-file=.env.e2e scripts/e2e-selftest.mjs` en verde, sin regresiones en las secciones de clases, portales y `agente-por-areas`; diagnosticar y corregir hasta verde; registrar el conteo en "Línea base / cierre"
- [x] T101 Verificación técnica de producción de `quickstart.md` §4: con `NODE_ENV=production`, `GET /api/dev/zoom-mock/*` → 404; durante una sincronización los logs del contenedor no contienen `Authorization`, token ni secreto; registrar en "Línea base / cierre"
- [ ] T102 Pasos del dueño en Zoom Marketplace (`quickstart.md` §5, decirlos en voz alta y acompañar): averiguar la topología (Q1: 1 organización o 5 cuentas), crear una app **Server-to-Server OAuth** "CadIT CRM — grabaciones" por cuenta con usuario Owner/Admin, copiar Account ID / Client ID / Client Secret, completar Information, agregar SOLO los scopes de lectura (`cloud_recording:read:list_user_recordings:admin`, `user:read:list_users:admin`; o `recording:read:admin` + `user:read:admin` en apps clásicas), activar la app, activar "Embed passcode in the shareable link" (Q3) y revisar "Delete cloud recordings after N days"; luego cargar cada conexión en `/settings/zoom`, Probar y vincular cada aula
- [ ] T103 Verificación en vivo con la cuenta real (`quickstart.md` §6), con la periódica APAGADA (`ZOOM_SYNC_INTERVAL_MIN=0`, sin `ZOOM_*_BASE_URL`): Probar → usuarios reales; vincular UNA aula y Sincronizar; **[verificar en vivo]** que `playUrl` abre la grabación en incógnito sin pedir código (DV-008, R2 — si lo pide, registrar si `share_url` traía `pwd` y si vino `recording_play_passcode`, y ajustar `buildPlayUrl` en `src/lib/zoom/links.ts` + `tests/unit/zoom-links.test.ts`); **[verificar en vivo]** que la ventana de 90 días se completa sin errores de rango y sin 429 (DV-010, R4); fechas/horas correctas en la zona de la academia; adjudicaciones razonables en 3 clases conocidas vistas desde el portal de un alumno de prueba; después vincular las otras aulas, resolver ambiguas/conflictos a mano, encender `ZOOM_SYNC_INTERVAL_MIN=60`, redeploy y al día siguiente confirmar SC-004; registrar cada resultado en "Línea base / cierre" de `specs/030-grabaciones-zoom/tasks.md`
- [ ] T104 Paso operativo R1 (decirlo en voz alta al dueño): 0 de 41 cohortes tienen `meeting_url` cargado; hasta cargar la reunión recurrente de cada cohorte, la adjudicación cae en la señal de aula y los choques de aula quedan `ambigua`. Dejar en el resumen de cierre la lista de cohortes sin `meeting_url` (y las 6 sin horario, que nunca son candidatas) y medir SC-001 recién después de esa carga; registrar la lista en "Línea base / cierre" de `specs/030-grabaciones-zoom/tasks.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T002 (número de migración) antes de T016.
- **Foundational (Phase 2)**: depende de Setup; **T007 (enmienda) va primero**; bloquea todas las historias.
- **US4 (Phase 3)**: depende solo de Foundational. Es el prerequisito de datos de las demás (conexión + aulas vinculadas).
- **US1 (Phase 4)**: depende de Foundational y de US4 (`connections.ts`, aulas vinculadas para sincronizar).
- **US2 (Phase 5)**: depende de US1 (`sync.ts` con `afterPage`, `recordings.ts`, `recordings-client.tsx`).
- **US3 (Phase 6)**: depende de US2 (`assignment.ts`, `matching.ts` para las sugeridas).
- **US5 (Phase 7)**: depende de US1 (`runSync`); su UI se monta sobre la de US2 (T088 → T069).
- **US6 (Phase 8)**: depende de US2 (adjudicación + rutas manuales con `recording_source`); el guard T091 puede escribirse en cuanto termina Foundational.
- **Polish (Phase 9)**: depende de todas las historias que se entreguen.

### User Story Dependencies (orden de completitud recomendado)

`Foundational → US4 → US1 → US2 → US3 → US5 → US6 → Polish`

- **US4** es independiente: se prueba sola contra el mock (checks 1–3).
- **US1** es probable de forma independiente con el botón: las grabaciones quedan `pendiente`, pero la tabla, los filtros y copiar/ver ya entregan el valor.
- **US2** agrega el matcher sobre la sincronización de US1; su núcleo (`matching.ts`) es puro y se puede escribir en paralelo con US1 por otro escritor.
- **US3** necesita la persistencia de US2 (mismo `assignment.ts`).
- **US5** solo necesita `runSync`; puede ir en paralelo con US2/US3 si hay un segundo escritor (archivos disjuntos salvo `recordings-client.tsx` y `sync.ts`).
- **US6** es casi solo verificación: no hay código de portal nuevo (DV-007).

### Within Each User Story

- Tests primero, en rojo; después implementación; al final la tarea "Verificar USx".
- Módulos de dominio (`src/server/zoom/*`) antes de las rutas; rutas antes de la UI; UI antes del E2E en verde.
- `src/server/zoom/sync.ts`, `src/server/zoom/assignment.ts`, `src/server/zoom/recordings.ts`, `src/components/recordings/recordings-client.tsx`, `src/components/recordings/recording-row-actions.tsx`, `src/lib/nav.ts` y `scripts/e2e/grabaciones-zoom.mjs` los tocan varias historias: nunca en paralelo entre sí.

### Parallel Opportunities

- Setup: T003, T004, T005 en paralelo.
- Foundational: tests T008–T013 en paralelo; T015, T018, T019, T020 en paralelo; T024 → (T026, T027, T028) en paralelo.
- US4: tests T031, T032 en paralelo; rutas T035–T038 en paralelo tras T034; T039 y T040 en paralelo con ellas.
- US1: tests T044, T045 en paralelo; T050, T052, T053 en paralelo.
- US2: tests T058–T060 en paralelo; T065, T066, T067 en paralelo tras T063.
- US3: tests T071, T072 en paralelo; rutas T076–T078 en paralelo.
- US5: tests T082, T083 en paralelo; T087 en paralelo con T085/T086.
- US6: T091 puede escribirse en paralelo con cualquier fase posterior a Foundational.
- Polish: T095, T096, T097 en paralelo.

---

## Parallel Example: User Story 4

```bash
# Tests primero, en paralelo:
Task: "tests/unit/zoom-connections.test.ts"
Task: "tests/unit/zoom-secretos.test.ts — rutas"
# tras T034 (connections.ts), en paralelo:
Task: "src/app/api/settings/zoom/connections/route.ts"
Task: "src/app/api/settings/zoom/connections/[id]/route.ts"
Task: "src/app/api/settings/zoom/connections/[id]/test/route.ts"
Task: "src/app/api/settings/zoom/rooms/[roomId]/route.ts"
Task: "src/server/virtual-rooms.ts — DTO con vínculo Zoom"
Task: "src/lib/nav.ts — Configuración › Zoom"
```

## Parallel Example: User Story 1

```bash
Task: "tests/unit/zoom-sync.test.ts"
Task: "tests/unit/zoom-recordings.test.ts"
# luego, en paralelo:
Task: "src/app/api/recordings/route.ts"
Task: "src/lib/nav.ts — ítem Grabaciones"
Task: "src/components/recordings/recording-row-actions.tsx — copiar / ver / código"
```

## Parallel Example: User Story 2

```bash
Task: "tests/unit/zoom-matching.test.ts"
Task: "tests/unit/zoom-assignment.test.ts — applyMatch"
Task: "tests/unit/recording-url-escrituras.test.ts"
# tras T063 (assignment.ts), en paralelo:
Task: "src/app/api/class-sessions/[id]/links/route.ts — recording_source"
Task: "src/app/api/portal/classes/[id]/recording/route.ts — recording_source"
Task: "src/server/classes.ts — StaffClassRowDto.recordingSource"
```

## Parallel Example: User Story 3

```bash
Task: "tests/unit/zoom-assignment.test.ts — operaciones manuales"
Task: "tests/unit/zoom-candidates.test.ts"
# luego, en paralelo:
Task: "src/app/api/recordings/[id]/candidates/route.ts"
Task: "src/app/api/recordings/[id]/assignment/route.ts"
Task: "src/app/api/recordings/[id]/assignment/reset/route.ts"
```

## Parallel Example: User Story 5

```bash
Task: "tests/unit/zoom-scheduler.test.ts"
Task: "tests/unit/zoom-sync.test.ts — arranque y recuperación"
# luego, en paralelo:
Task: "src/server/zoom/scheduler.ts"
Task: "src/components/recordings/sync-status.tsx"
```

## Parallel Example: User Story 6

```bash
Task: "tests/unit/portal-grabaciones.test.ts"   # se puede escribir apenas cierra Foundational
```

---

## Implementation Strategy

### MVP = Setup + Foundational + US4 + US1

El valor mínimo y autónomo de la spec es US1 ("aunque la adjudicación no existiera, tener las grabaciones de las 5 cuentas en una tabla con el enlace a mano ya elimina la búsqueda manual"), y US1 necesita la conexión de US4. Por eso el MVP es:

1. Phase 1 Setup (con el número de migración confirmado).
2. Phase 2 Foundational (enmienda constitucional PRIMERO).
3. Phase 3 US4 → validar checks 1–3.
4. Phase 4 US1 → validar checks 4–6, 17 y el bloque UI.
5. **STOP y VALIDAR**: gate + `E2E_SECCIONES=grabaciones-zoom`. Sin conexiones en producción no cambia nada (FR-005); con una conexión, coordinación ya copia enlaces sin entrar a Zoom. La periódica sigue apagada (`ZOOM_SYNC_INTERVAL_MIN=0`).

### Incremental Delivery

1. MVP (US4 + US1) → grabaciones en una tabla, botón Sincronizar.
2. + US2 → adjudicación automática (la promesa "sin que nadie lo pegue"). Antes de mostrarla a alumnos con datos reales, T103 debe confirmar que `playUrl` abre sin código (R2).
3. + US3 → salida manual para ambiguas y conflictos.
4. + US5 → sincronización periódica; encenderla en producción solo después de T103.
5. + US6 → verificación de los portales (sin código nuevo).
6. Polish: CLAUDE.md, guía, E2E completo sobre base limpia, pasos del dueño en Zoom y verificación en vivo, paso operativo R1.

### Parallel Team Strategy

Un solo escritor por defecto (`sync.ts`, `assignment.ts`, `recordings-client.tsx` y el arnés E2E son compartidos). Con un segundo escritor en worktree aislado: el matcher puro (T058 + T062) corre en paralelo con US1, y US5 (T082, T085, T087) en paralelo con US2/US3.

---

## Notes

- [P] = archivos distintos y sin dependencia de tareas incompletas.
- Cada historia termina con su tarea "Verificar USx" (tests + sección E2E en verde).
- No se commitea dentro de esta lista; el commit lo decide el dueño.
- Riesgos del plan cubiertos por tareas: R1 → T104; R2 → T103; R3 → T044/T048 (`missing_in_zoom_at`, vencimiento visible); R4 → T009/T022 + T103; R5 → T044 + T089; R6 → T059/T065/T066 + T092; R7 → T060.
- Items **[verificar en vivo]** (DV-008 passcode, DV-010 límites y antigüedad consultable) se cierran solo en T103, con la cuenta real.

## Línea base / cierre

_(T001, T002, T089, T100, T101 y T103 completan esta sección.)_

- **T001 (2026-10-09)** — Línea base en `030-grabaciones-zoom`: `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm test` ✅ **147 archivos / 1983 tests**.
- **T002 (2026-10-09)** — `origin/main` termina en `0051_agente_por_areas`: el número **0052** queda confirmado (`0052_grabaciones_zoom`), sin renombres en los documentos.
- **T017 (2026-10-09)** — Respaldos `backups/vocero-pre-0052-20261009-093336.sql` y `backups/vocero_e2e-pre-0052-20261009-093336.sql`. Aplicada a `vocero` y `vocero_e2e` con `psql --single-transaction` dentro del contenedor (la contraseña de `MIGRATION_DATABASE_URL` en `.env` no es la correcta, mismo procedimiento que 0050/0051) y registrada en `drizzle.__drizzle_migrations` con el hash sha256 del archivo (LF) y el `when` del journal. Re-aplicada una segunda vez sin errores (idempotente). `rls-cobertura` ✅.
- **T003 (pendiente)** — Las variables `ZOOM_*` están declaradas en `src/lib/env.ts` con su guía, pero `.env.example`/`.env` no son editables desde la sesión del agente: copiar el bloque del reporte a `.env.example`.
- **T030 (parcial)** — Gate en verde (ver cierre del MVP). La corrida E2E COMPLETA quedó para después por decisión del dueño; solo corrió la sección `grabaciones-zoom`.
- **Cierre MVP (US4 + US1, 2026-10-09)** — `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ **155 archivos / 2095 tests** · `NEXT_DIST_DIR=.next-build pnpm build` ✅ · `E2E_SECCIONES=grabaciones-zoom` contra el zoom-mock (puerto 3005, `vocero_e2e`): **31/31 checks OK, 0 fallos** (checks 1–6 sin adjudicación, segunda corrida idempotente, 17, pantalla `/grabaciones` y `/settings/zoom` en claro y oscuro).
- **US2 + US3 (2026-10-09)** — `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ **159 archivos / 2143 tests** · `NEXT_DIST_DIR=.next-build pnpm build` ✅ · `E2E_SECCIONES=grabaciones-zoom` contra el zoom-mock: **47/47 checks OK, 0 fallos** (checks 1–7, 10–14, 17, liberar al pegar a mano (R6), cohorte → clase y el panel de sugeridas de la fila ambigua). Desvío del guard T060: la escritura del profesor vive en `src/server/teacher-portal.ts` (`teacherSetRecording`), no en la ruta; el guard nombra ese archivo.

## Addendum — prueba en vivo del dueño (2026-10-09)

- [x] T120 [A1] Marca de agua POR AULA (`virtual_room.zoom_synced_through`, migración 0053, research R-12): ventana por aula, avanza solo la que terminó bien; cambiar el usuario vinculado la vacía; sin aulas → `sin_aulas` sin lease ni corrida. Tests: `zoom-sync.test.ts`, `zoom-connections.test.ts`.
- [x] T121 [A1] Re-adjudicar al sincronizar las grabaciones `auto` no asignadas que la corrida no tocó (`rematchUntouched`, tandas de 200; las `manual` nunca).
- [x] T122 [A2] `POST /api/recordings/sync` → 422 `sin_aulas` con "No hay aulas vinculadas a Zoom: vinculalas en Configuración › Zoom"; la pantalla lo muestra con enlace a Configuración › Zoom.
- [x] T123 [A3] Adaptador: `pmi` en `listUsers`; vincular llena `account_email` del aula y guarda `zoom_user_pmi`; "Probar" lo refresca; aviso en Configuración › Zoom cuando el enlace del aula ≠ PMI con "Actualizar enlace del aula a la sala personal de Zoom" (`POST /api/settings/zoom/rooms/[roomId]/pmi`, re-consulta a Zoom; el nombre no se toca).
- [x] T124 [A4] `zoom_recording.file_types` (solo metadatos de `recording_files`); `hasTranscript` (TRANSCRIPT/CC) → chip "Transcripción"; duración legible (`src/lib/duration.ts`).
- [x] T125 [B] `/grabaciones` como tabla de datos: paginación numerada con total y tamaño 25/50/100 (`page`/`pageSize`/`sort`, `count(*)` + `offset` sobre `(organization_id, start_time)`), orden por fecha, encabezado fijo, filtros en la URL, estados vacío/cargando, scroll horizontal solo dentro del contenedor. `src/lib/pagination.ts`.
- [x] T126 [C] Cuenta dual: `addTeamMember` adjunta `member` a un PROFESOR existente (sin contraseña nueva, con regla de escalada); alumno → 409 `es_alumno`; `DELETE /api/settings/team/[memberId]` (`removeMember`) borra solo `member`; "Ver como: Equipo / Profesor" en las dos barras con cookie `vista` (`src/lib/view-preference.ts`) que decide `/`. Tests: `cuenta-dual.test.ts`, `portal-session.test.ts`, `route-capabilities.test.ts`. CLAUDE.md actualizado.
- [x] T127 Verificar addendum: `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ **161 archivos / 2178 tests** · `NEXT_DIST_DIR=.next-build pnpm build` ✅ · E2E (puerto 3005, `vocero_e2e`, zoom-mock): `grabaciones-zoom` **60/60** · `roles` (con cuenta dual) **54/54**.
- **0053 (2026-10-09)** — Respaldos `backups/vocero-pre-0053-20261009-120044.sql` y `backups/vocero_e2e-pre-0053-20261009-120044.sql`; aplicada con `psql` dentro del contenedor a `vocero` y `vocero_e2e` y registrada en `drizzle.__drizzle_migrations` (sha256 del archivo + `when` del journal). Sin tablas nuevas (RLS sin cambios). Re-ejecutable.
- Nota: `.env.e2e` no trae `ZOOM_API_BASE_URL`/`ZOOM_OAUTH_BASE_URL`; la app E2E se levanta con ellas en la línea de comandos (si no, el adaptador apunta a zoom.us).

## Cierre US5 + US6 + Polish (2026-10-09)

- **Gate (T099)** — `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ **163 archivos / 2207 tests** · `NEXT_DIST_DIR=.next-build pnpm build` ✅ (el build no arranca la periódica: `shouldStartScheduler` mira `NEXT_PHASE`/`VITEST`/`NODE_ENV`). `origin/main` (ref local) ya trae 0052 y 0053: sin choque de número. `next-env.d.ts` y el `.snap` de `prompt-ruteo` (solo fin de línea) restaurados.
- **E2E (T090/T094/T098)** — app en el puerto 3005 contra `vocero_e2e` con `ZOOM_API_BASE_URL`/`ZOOM_OAUTH_BASE_URL` → zoom-mock en la línea de comandos: `grabaciones-zoom` **76/76** (checks 1–18 y 20, US6-3, addendum y pantalla; el 18 "base que nunca conectó" se cubre en unit porque la base E2E ya tuvo conexiones) · `grabaciones-zoom-periodica` con `ZOOM_SYNC_INTERVAL_MIN=1` **5/5** (check 19: R8 llega sin apretar el botón). Con la periódica encendida, la sección principal aborta en su guard (comprobado).
- **Guard del arnés** — las dos secciones consultan `GET /api/dev/zoom-mock/config` (bases reales del adaptador, `zoomBases()`) y abortan si no apuntan al zoom-mock, o si el entorno del arnés trae otra base.
- **Fuga encontrada por el E2E (T093)** — `teacherCohortClasses` reusa la lista de staff y descartaba campo por campo; `recordingSource` (US2) viajaba al portal del profesor. Corregido en `src/server/teacher-portal.ts`; `tests/unit/portal-grabaciones.test.ts` ahora exige que TODO campo extra de `StaffClassRowDto` se descarte ahí.
- **T089 (R5)** — `next start` ×2 (3006/3007, `.next-build`, `NODE_ENV=production`) + el dev de 3005, los tres con `ZOOM_SYNC_INTERVAL_MIN=1` contra `vocero_e2e`: 3 corridas periódicas en la ventana, **0 solapadas**; un proceso registró `sync_en_curso` y se fue. Se midió durante la vida de la conexión de la sección periódica (no 3 ticks completos de una misma conexión).
- **T101** — con `NODE_ENV=production`, `GET /api/dev/zoom-mock/config` → 404; los logs de los dos `next start` durante las corridas no tienen `Authorization`, token ni secreto (solo `[zoom-sync] periódica: <org> → <resultado>`).
- **Desvío deliberado** — `ZOOM_SYNC_INTERVAL_MIN` pasa a default **0** (antes 60): un deploy no enciende la periódica solo; se enciende a mano después de T103.
- **Pendientes del dueño** — T003 (`.env.example` no es editable desde la sesión del agente), T030/T100 (corrida E2E COMPLETA, pospuesta por decisión del dueño), T102–T104 (Zoom Marketplace, **[verificar en vivo]** passcode/90 días con la cuenta real, carga de `meeting_url` por cohorte).

## Reproductor embebido de Zoom en los portales (2026-10-09)

- [x] T130 Constitución 1.6.0 → **1.7.0** (MINOR: amplía el alcance del ítem 5 de Zoom — el navegador carga el reproductor oficial de una grabación adjudicada, tras un componente, sin que el servidor toque video). Sync Impact Report y Soberanía de CLAUDE.md actualizados.
- [x] T131 [P] `zoomEmbedUrl()` en `src/lib/zoom/links.ts` (lista de permitidos: https, `zoom.us`/`*.zoom.us`, sin credenciales ni puerto, `/rec/share/` o `/rec/play/`; conserva la query con `pwd=`). Tests en `tests/unit/zoom-recording-player.test.ts`.
- [x] T132 `ZoomRecordingPlayer` (`src/components/portal/zoom-recording-player.tsx`): iframe 16:9 con `allow`, `allowFullScreen`, `sandbox` sin `allow-top-navigation`, `title`, `loading="lazy"`, `referrerPolicy`; "Abrir en Zoom" siempre debajo. Guard: solo ese componente usa `zoomEmbedUrl` y solo los dos portales lo montan.
- [x] T133 Cableado en la pestaña Clases del alumno (`student-course-client.tsx`) y del profesor (`portal-cohort-client.tsx`): *Ver grabación* despliega el reproductor debajo de la fila (iframe montado al abrir). Los datos que viajan no cambian (`portal-grabaciones.test.ts` verde). Sin CSP en la app: nada que ampliar en `frame-src`. DESIGN.md actualizado.
- [x] T134 **[verificar en vivo]** con un enlace real de `us06web.zoom.us/rec/share/…?pwd=…` que el reproductor funcione CON el `sandbox` (si no, quitar el atributo en el componente y su test). — Verificado por el dueño el 2026-10-09: reproduce con sandbox, también en incógnito.
- [x] T135 Gate: `pnpm typecheck` ✅ · `pnpm lint` ✅ · `pnpm test` ✅ **164 archivos / 2237 tests** · `NEXT_DIST_DIR=.next-build pnpm build` ✅ · `next-env.d.ts` y el `.snap` de `prompt-ruteo` restaurados. Sin E2E (decisión del dueño).
