# Implementation Plan: Grabaciones de Zoom — sección central y adjudicación automática a clases

**Branch**: `030-grabaciones-zoom` | **Date**: 2026-10-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/030-grabaciones-zoom/spec.md`

Asume [research.md](research.md) (13 DV resueltas), [data-model.md](data-model.md)
y los contratos de [contracts/](contracts/).

## Summary

El CRM se conecta a Zoom (Server-to-Server OAuth, **solo lectura**) a través de
un adaptador único `src/lib/zoom`, con **conexiones** cargadas por la UI
(cifradas, últimos 4) que cubren uno o muchos usuarios de Zoom — así sirve
igual si las 5 cuentas son una organización o cinco cuentas. Cada aula virtual
se vincula a (conexión, usuario de Zoom).

Una **sincronización in-process** —botón + temporizador periódico, sin colas—
trae las grabaciones en la nube de los usuarios vinculados a aulas activas,
en tramos de ≤ 1 mes con paginación y reintentos, y las guarda con upsert
idempotente por instancia de reunión. Un lease en base garantiza un solo
corredor por organización; una ventana de recuperación cubre grabaciones
tardías y servidores apagados.

Un **matcher puro** adjudica cada grabación a la única clase real, no
cancelada, cuya reunión (clase → cohorte) tenga el mismo número —o, en su
defecto, cuya aula esté hospedada por el anfitrión— dentro de una ventana de
tolerancia compuesta con `classInstant()`. Ambigüedad → no adjudica. La
adjudicación escribe `class_session.recording_url` (+ `recording_source =
'zoom'`), de modo que portales y listas de clases no cambian; un enlace pegado
a mano nunca se pisa y una decisión manual nunca la deshace la sincronización.

La sección **Grabaciones** (`/grabaciones`) lista todo con filtros, copiar /
ver enlace (con código de acceso cuando hace falta) y asignación manual.
Requiere enmienda MINOR de la constitución (1.5.0 → 1.6.0): Zoom entra a la
lista cerrada del Principio II.

## Technical Context

**Language/Version**: TypeScript 5 estricto (`strict` + `noUncheckedIndexedAccess`), Node 20

**Primary Dependencies**: Next.js 15 (App Router) + React 19, Drizzle ORM, Zod, Better Auth (organization), Tailwind (tema Atlas por tokens). **Sin dependencias npm nuevas**: el adaptador usa `fetch` nativo (como `src/lib/m365`).

**Storage**: PostgreSQL. Migración `0052_grabaciones_zoom.sql`: tablas `zoom_connection`, `zoom_recording`, `zoom_sync_state`, `zoom_sync_run` (RLS + `tenant_isolation` a mano); columnas `virtual_room.zoom_connection_id/zoom_user_id/zoom_user_email`, `class_session.recording_source` (+ backfill `'manual'`); backfill de capacidades en roles de sistema.

**Testing**: Vitest (unit, incluidos guards estructurales) + arnés E2E `scripts/e2e-selftest.mjs` (sección nueva `grabaciones-zoom`) contra **zoom-mock nuevo**; Playwright para `/grabaciones`, `/settings/zoom` y los dos portales.

**Target Platform**: Contenedor Docker (Linux) self-hosted, Coolify o compose + Caddy. Puede haber 2 procesos durante un rolling deploy → lease en base.

**Project Type**: Monolito web (Next.js App Router, API + UI en el mismo proyecto).

**Performance Goals**: listado de grabaciones < 300 ms p95 con 5 000 filas (índice `(org, start_time desc)`, paginación por cursor); una sincronización incremental de 5 usuarios < 30 s; ninguna transacción abierta durante HTTP a Zoom.

**Constraints**: solo lectura en Zoom; ninguna llamada a Zoom fuera de `src/lib/zoom`; mocks/tests jamás a Zoom real; secreto cifrado y nunca al cliente/logs; horarios solo vía `classInstant()`; proyecciones nunca adjudicables; sin ruta de portal nueva; colores solo por tokens; capacidades, no roles; el CRM no descarga/almacena/retransmite video.

**Scale/Scope**: 1 organización, 5 aulas/cuentas, 41 cohortes (~6/41 sin horario, 0/41 con `meeting_url` hoy), ~10–20 grabaciones/semana. Pantallas: `/grabaciones` (nueva), `/settings/zoom` (nueva), lista de clases (chip de origen). 9 rutas nuevas, 2 modificadas.

## Constitution Check

*GATE: pasa antes de Phase 0 con la enmienda planificada. Re-evaluado después de Phase 1 (abajo).*

| Principio | Cómo lo cumple | Estado |
|---|---|---|
| **I — Seguridad** | Client Secret cifrado AES-256-GCM (`lib/crypto`), solo `last4` sale; passcode cifrado; `ZoomError.message` propio sin token/secreto/cuerpo crudo (test con secreto centinela); mock log sin headers de auth. Grabaciones no adjudicadas nunca llegan a portales (guard estructural). | ✅ |
| **II — Soberanía** | Zoom **no está** en la lista cerrada (1.5.0 tiene WhatsApp, LLM, M365, Vimeo-navegador). | ⚠️ **Enmienda MINOR 1.5.0 → 1.6.0** (T-CONST, abajo). Diseño ya conforme al texto propuesto: adaptador único, S2S, solo lectura, opcional, sin almacenar video. |
| **III — Multi-tenancy** | 4 tablas nuevas con `organization_id NOT NULL`, índices org-first, RLS `tenant_isolation`; toda query por `scoped()`; la corrida abre `withOrganizationScope(org, "system:zoom-sync")` por página. El temporizador enumera organizaciones (tabla sin RLS) y entra a cada una con su alcance. | ✅ |
| **IV — Idempotencia** | `UNIQUE (org, connection, zoom_meeting_uuid)` + upsert; matcher estable (no mueve `auto/asignada`, no toca `manual`); lease = una corrida a la vez; `pg_advisory_xact_lock` por clase al adjudicar; migración re-ejecutable. | ✅ |
| **V — Calidad verificable** | Gate técnico + tests en [quickstart.md](quickstart.md) §2. | ✅ |
| **VI — Specs antes de código** | spec.md → este plan → tasks.md. | ✅ |
| **VII — Trazabilidad** | Supuestos visibles: topología (DV-002), solo usuarios vinculados (DV-012), passcode **[verificar en vivo]** (DV-008), antigüedad consultable (DV-010), tolerancias por entorno. | ✅ |
| **VIII — Foco vertical** | Sirve al negocio que opera la instancia (la academia y su cursada, ya dentro del dominio desde 013); no es plataforma de video. | ✅ |
| **IX — Verificación en vivo** | Sección E2E `grabaciones-zoom` contra zoom-mock con resultado observable en los portales (Playwright), caminos infelices (401, 429, 500, sin Zoom, conflicto); verificación con cuenta real en quickstart §6 (local primero, con solo-botón antes de la periódica). | ✅ |

### Enmienda planificada (T-CONST) — texto propuesto

**1. Principio II, lista de dependencias permitidas — agregar el ítem 5:**

> 5. **Zoom (API REST v2)**, para LEER las grabaciones en la nube de las
>    cuentas de Zoom del propio negocio y adjudicar su enlace a las clases,
>    accedido EXCLUSIVAMENTE a través del adaptador `src/lib/zoom`.
>    Autenticación por Server-to-Server OAuth (account credentials) con
>    scopes de SOLO LECTURA (listar grabaciones en la nube y listar usuarios);
>    ningún scope de escritura, borrado ni de reuniones. Las credenciales
>    (Account ID, Client ID, Client Secret) se almacenan cifradas en reposo
>    (AES-256-GCM, `lib/crypto`), NUNCA viajan al cliente ni a logs, y solo se
>    muestran sus últimos 4 caracteres. El CRM NO descarga, almacena ni
>    retransmite video: una grabación es un ENLACE a la nube de Zoom, igual
>    que el principio del reproductor de Vimeo. Es OPCIONAL: sin conexiones de
>    Zoom configuradas el CRM funciona idéntico y la grabación se carga a mano.
>    Los tests y los entornos de prueba JAMÁS llaman a la API real de Zoom
>    (mock tras el gate de desarrollo).

**2. Principio II, viñeta del instalador — reemplazar por:**

> - El instalador solo necesita: un VPS con Coolify o Docker, un dominio,
>   credenciales de Meta, (opcional) un token de OpenRouter, las credenciales
>   de M365 para el envío de correo y (opcional) una app Server-to-Server
>   OAuth de Zoom por cuenta para las grabaciones. Nada más (el reproductor de
>   Vimeo no requiere credenciales).

**3. Principio II, viñeta de adaptadores — reemplazar por:**

> - Las integraciones externas permitidas se aíslan tras adaptadores dedicados
>   (cliente Graph API propio; adaptador LLM; adaptador `src/lib/m365`;
>   adaptador `src/lib/zoom`; componente único del reproductor de Vimeo) para
>   no acoplar el dominio a ellas.

**4. Restricciones de Plataforma y Seguridad, "Aislamiento de integraciones" — reemplazar por:**

> - **Aislamiento de integraciones**: las dependencias de APIs externas se
>   acceden a través de adaptadores dedicados (cliente Graph API propio,
>   adaptador LLM OpenRouter-compatible, `src/lib/m365`, `src/lib/zoom`), no
>   dispersas por el dominio.

Sync Impact Report a agregar (arriba del de 1.5.0):

```text
Versión: 1.5.0 → 1.6.0

Cambios (1.6.0, <fecha de implementación>):
  - Principio II: se AGREGA Zoom (API REST v2) como quinta dependencia de
    runtime permitida, para LEER las grabaciones en la nube de las cuentas
    del negocio y adjudicar su enlace a las clases (feature
    030-grabaciones-zoom). Adaptador único `src/lib/zoom`; Server-to-Server
    OAuth con scopes de solo lectura; credenciales cifradas AES-256-GCM,
    nunca al cliente ni a logs, solo últimos 4; el CRM no descarga ni
    almacena video (mismo criterio que Vimeo); opcional — sin Zoom el CRM
    funciona idéntico; tests y mocks jamás llaman a Zoom real.
  - Principio II: la viñeta del instalador suma "(opcional) una app
    Server-to-Server OAuth de Zoom por cuenta"; la de adaptadores nombra
    `src/lib/m365` y `src/lib/zoom`.
  - Restricciones de Plataforma: "Aislamiento de integraciones" nombra los
    mismos adaptadores.
  - Retoma la DV-001 de la idea 018 (resuelta: enmienda + opcional con
    degradación). Crear reuniones en Zoom sigue FUERA (requeriría scopes de
    escritura y otra enmienda).
  Bump: MINOR — amplía la lista cerrada del Principio II sin redefinir
  principios existentes.

Plantillas dependientes: plan/spec/tasks — ✅ compatibles (sin secciones nuevas).
TODOs diferidos: webhook `recording.completed` (fuera de esta enmienda; si se
agrega, no requiere enmienda nueva: misma dependencia y adaptador, pero sí
un secreto más por conexión).
```

Pie: `**Version**: 1.6.0 | **Ratified**: 2026-07-09 | **Last Amended**: <fecha de implementación>`.
Se aplica como PRIMERA tarea de implementación, antes de cualquier código que
llame a Zoom. CLAUDE.md: la línea "Soberanía (II, endurecida)" suma Zoom
(constitución 1.6.0, tras `src/lib/zoom`, solo lectura).

### Re-check post-diseño (Phase 1)

Sin cambios respecto de la tabla. El diseño no agregó dependencias npm ni
servicios más allá de Zoom; las 4 tablas nuevas tienen RLS; el único punto que
requiere enmienda sigue siendo II, y el diseño cumple cada cláusula del texto
propuesto (adaptador único — guard estructural; solo lectura — scopes
documentados en quickstart §5 y ningún método de escritura en el adaptador;
cifrado — data-model; opcional — FR-005/check 18; mocks — DV-011).
Complexity Tracking vacío.

## Project Structure

### Documentation (this feature)

```text
specs/030-grabaciones-zoom/
├── spec.md
├── plan.md                    # este archivo
├── research.md                # DV-001..DV-013
├── data-model.md
├── quickstart.md              # mocks, E2E, pasos en Zoom Marketplace, verificación en vivo
├── contracts/
│   ├── zoom-adapter.md        # src/lib/zoom: tipos, funciones, reintentos
│   ├── adjudicacion.md        # matcher puro + persistencia + operaciones manuales
│   └── api-grabaciones.md     # rutas + capacidades + mock
├── checklists/
│   └── requirements.md
└── tasks.md                   # /speckit-tasks (no lo crea este comando)
```

### Source Code (repository root)

```text
.specify/memory/constitution.md                 # MOD  T-CONST 1.5.0 → 1.6.0
drizzle/0052_grabaciones_zoom.sql               # NEW  4 tablas + RLS + columnas + backfills
drizzle/meta/…                                  # NEW  snapshot (db:generate)

src/lib/
├── db/schema.ts                                # MOD  zoomConnection, zoomRecording, zoomSyncState, zoomSyncRun; columnas en virtualRoom y classSession
├── db/ids.ts                                   # MOD  prefijos zc_, zr_, zsr_
├── capabilities.ts                             # MOD  "grabaciones.ver", "grabaciones.gestionar"; SYSTEM_ROLES (soporte solo .ver)
├── env.ts                                      # MOD  ZOOM_API_BASE_URL, ZOOM_OAUTH_BASE_URL, ZOOM_SYNC_*, ZOOM_MATCH_*
├── nav.ts                                      # MOD  "Grabaciones" en Gestión (grabaciones.ver); Configuración › Zoom (configuracion.editar)
└── zoom/                                       # NEW  adaptador único (contracts/zoom-adapter.md)
    ├── client.ts
    ├── links.ts
    ├── types.ts
    └── index.ts

src/server/
├── zoom/connections.ts                         # NEW  CRUD de conexiones, cifrado/descifrado, testConnection(), linkRoom()
├── zoom/sync.ts                                # NEW  runSync(org, trigger, connectionId?): lease, ventana, iteración por aula, upsert por página, bitácora
├── zoom/lease.ts                               # NEW  acquireLease/renewLease/releaseLease sobre zoom_sync_state
├── zoom/scheduler.ts                           # NEW  startZoomScheduler(): setInterval.unref(), enumera orgs, llama runSync('periodica')
├── zoom/matching.ts                            # NEW  matchRecording() puro + loadMatchContext()
├── zoom/assignment.ts                          # NEW  applyMatch, assignManually, unassign, resetToAuto, clearClassIfOwned
├── zoom/recordings.ts                          # NEW  listRecordings() (filtros, cursor, DTO), listCandidates()
├── virtual-rooms.ts                            # MOD  DTO de aula incluye vínculo Zoom (solo staff); archivar aula no borra el vínculo
├── classes.ts                                  # MOD  fila de staff (`StaffClassRowDto`) expone recordingSource para el chip "Zoom"/"manual" — buildClassRow y DTO de portal SIN cambios
└── dev/zoom-mock-state.ts                      # NEW  cuentas/usuarios/grabaciones sembradas, modo falla, log

src/instrumentation-node.ts                     # MOD  marca zoom_sync_run 'corriendo' huérfanas → 'error'; libera leases vencidos; arranca startZoomScheduler()
src/instrumentation.ts                          # MOD  llama a lo anterior

src/app/
├── api/recordings/route.ts                     # NEW  GET (grabaciones.ver)
├── api/recordings/sync/route.ts                # NEW  GET (grabaciones.ver), POST (grabaciones.gestionar)
├── api/recordings/[id]/candidates/route.ts     # NEW  GET (grabaciones.gestionar)
├── api/recordings/[id]/assignment/route.ts     # NEW  PUT, DELETE (grabaciones.gestionar)
├── api/recordings/[id]/assignment/reset/route.ts # NEW POST (grabaciones.gestionar)
├── api/settings/zoom/connections/route.ts      # NEW  GET, POST (configuracion.editar)
├── api/settings/zoom/connections/[id]/route.ts # NEW  PATCH (configuracion.editar)
├── api/settings/zoom/connections/[id]/test/route.ts # NEW POST (configuracion.editar)
├── api/settings/zoom/rooms/[roomId]/route.ts   # NEW  PUT (configuracion.editar)
├── api/class-sessions/[id]/links/route.ts      # MOD  recording_source='manual'; libera grabación Zoom previa
├── api/portal/classes/[id]/recording/route.ts  # MOD  ídem (sin datos nuevos al profesor)
├── api/dev/zoom-mock/[...path]/route.ts        # NEW  oauth/token, v2/users, v2/users/{id}/recordings (mockGuard)
├── api/dev/zoom-mock/seed/route.ts             # NEW  POST/DELETE
├── api/dev/zoom-mock/fail/route.ts             # NEW  POST
├── api/dev/zoom-mock/log/route.ts              # NEW  GET
├── (app)/grabaciones/page.tsx                  # NEW  server component: sesión + capacidades → cliente
└── (app)/settings/zoom/page.tsx                # NEW

src/components/
├── recordings/recordings-client.tsx            # NEW  tabla, filtros (conexión, aula, fechas, estado), estado de sync, botón Sincronizar
├── recordings/recording-row-actions.tsx        # NEW  copiar enlace / código, ver, asignar, desasignar, volver a automático
├── recordings/assign-dialog.tsx                # NEW  sugeridas + búsqueda; aviso de reemplazo
├── recordings/sync-status.tsx                  # NEW  última corrida por conexión; "corriendo desde…"
├── settings/zoom-connections-client.tsx        # NEW  conexiones (secreto ••••last4), Probar, vincular aulas a usuarios
└── cohorts/classes-client.tsx                  # MOD  chip "Zoom" junto a la grabación; editar a mano avisa que reemplaza la de Zoom

.env.example                                    # MOD  ZOOM_* con guía inline (sin credenciales: van por la UI)
CLAUDE.md                                       # MOD  fila del mapa "Grabaciones de Zoom" + Soberanía 1.6.0
DESIGN.md                                       # MOD  (si aplica) tabla de grabaciones / chips de estado con tokens existentes

scripts/e2e/grabaciones-zoom.mjs                # NEW  sección E2E (quickstart §3)
scripts/e2e-selftest.mjs                        # MOD  registra la sección
tests/e2e/us-grabaciones-zoom.md                # NEW  guion
tests/unit/
├── zoom-client.test.ts                         # NEW
├── zoom-links.test.ts                          # NEW
├── zoom-matching.test.ts                       # NEW
├── zoom-assignment.test.ts                     # NEW
├── zoom-sync.test.ts                           # NEW
├── zoom-adapter-guard.test.ts                  # NEW  guard estructural (Zoom solo en src/lib/zoom)
├── zoom-secretos.test.ts                       # NEW  ninguna respuesta con secreto/cifrado
├── portal-grabaciones.test.ts                  # NEW  guard: portales no leen zoom_recording
├── rls-cobertura.test.ts                       # (sin cambio: debe pasar con las 4 tablas nuevas)
└── route-capabilities.test.ts                  # (sin cambio: debe pasar con las rutas nuevas)
```

**Structure Decision**: monolito Next.js existente. Zoom vive SOLO en
`src/lib/zoom` (adaptador, como `src/lib/m365` y `src/lib/meta`); el dominio en
`src/server/zoom/` (conexiones, sincronización, adjudicación, listados). Los
portales y `buildClassRow` no se tocan: la adjudicación se proyecta sobre
`class_session.recording_url`, que ya es lo que leen (research DV-007).

## Orden, y por qué es ese

### Paso 0 — Enmienda (T-CONST)
Antes de cualquier línea que llame a Zoom. Texto arriba + línea de CLAUDE.md.

### Paso 1 — Datos, adaptador y mock (bloquea todo)
Migración 0052 (con RLS y backfills), schema, ids, capacidades, env,
`src/lib/zoom` (+ tests unitarios con `fetch` inyectado), zoom-mock y su
estado. **El mock va acá porque es lo que permite probar todo lo demás sin
cuentas reales.** Guards estructurales (adaptador, secretos) desde el día uno.

### Paso 2 — US4: conexiones y vínculo de aulas (P1, prerequisito)
`connections.ts` + rutas `/api/settings/zoom/*` + `/settings/zoom`. Probar
conexión contra el mock (camino feliz y `bad-secret`).

### Paso 3 — Matcher puro (base de US2)
`matching.ts` con la batería de invariantes ANTES de cualquier persistencia:
es la pieza donde un error pone la grabación de otra cohorte frente a un
alumno (SC-002).

### Paso 4 — US1 + US2: sincronización y adjudicación automática (P1)
`lease.ts`, `sync.ts`, `assignment.applyMatch`, `recordings.listRecordings`,
rutas `GET /api/recordings` y `/sync`, cambios en las 2 rutas de enlace manual
(`recording_source`). Verificar en los portales (Playwright) que la grabación
aparece — es la prueba de que no hacía falta tocarlos.

### Paso 5 — US3: asignación manual (P1)
`assignManually`, `unassign`, `resetToAuto`, `listCandidates`, rutas de
assignment/candidates.

### Paso 6 — UI de Grabaciones (US1/US3/US5)
`/grabaciones` con filtros, copiar/ver, diálogo de asignación, estado de sync;
chip en la lista de clases. Tokens de tema; `tema-oscuro` y `contraste` en
verde; capturas claro/oscuro.

### Paso 7 — US5: sincronización periódica
`scheduler.ts` + instrumentación (huérfanas, leases). Probar con intervalo 1
min y con dos procesos (`pnpm start` en dos puertos contra la misma base): una
sola corrida.

### Paso 8 — Cierre
Gate + `E2E_SECCIONES=grabaciones-zoom` + corrida E2E completa (que nada de lo
anterior se rompió; en especial las secciones de clases y portales) + CLAUDE.md
+ `.env.example`. Luego quickstart §5–6 con el dueño (cuenta real), con la
periódica apagada hasta validar.

## Riesgos y preguntas abiertas

### Preguntas abiertas para el dueño (ninguna bloquea el plan)

- **Q1 — Topología**: ¿las 5 cuentas son una organización de Zoom o cinco
  cuentas? El diseño cubre ambas; la respuesta solo define si se crean 1 o 5
  apps en el Marketplace (quickstart §5 dice cómo averiguarlo).
- **Q2 — Alcance de la sincronización. RESUELTA (2026-10-08)**: solo usuarios
  vinculados a un aula activa (DV-012). Decisión del dueño: las reuniones que
  no son clases no entran a CadIT.
- **Q3 — Código de acceso**: ¿la academia acepta activar "Embed passcode in
  the shareable link" en cada cuenta? Si no, el CRM igual arma el enlace con
  `pwd=`, pero hay que verificarlo en vivo (DV-008).

### Riesgos

- **R1 — 0/41 cohortes tienen `meeting_url` cargado.** Hasta que se carguen,
  la señal fuerte (número de reunión) no existe y todo cae en la señal de
  aula/anfitrión, que con choques de aula da `ambigua`. Mitigación: la tabla
  destaca ambiguas; paso operativo a decir en voz alta: cargar la reunión
  recurrente de cada cohorte (es además lo que 025 pide para el enlace de
  entrada). SC-001 se mide después de esa carga.
- **R2 — Passcode / enlace que pide código** (DV-008) — **[verificar en vivo]**
  antes de encender la periódica: si el enlace armado no abre sin código, los
  alumnos reciben un enlace que les pide algo que no tienen.
- **R3 — Grabaciones que vencen en Zoom** (borrado automático por plan o por
  configuración): el enlace en la clase deja de funcionar. Se muestra el
  vencimiento y "ya no está en Zoom" (DV-013); avisar es otra fase.
- **R4 — Límites de tasa / antigüedad consultable** — **[verificar en vivo]**
  (DV-010). Volumen esperado muy por debajo; el backoff cubre picos.
- **R5 — Rolling deploy con dos procesos**: el lease en base lo resuelve; el
  test con dos procesos está en el Paso 7.
- **R6 — Interacción con el profesor que pega el enlace**: si el profesor pega
  a mano DESPUÉS de una adjudicación automática, su enlace gana y la grabación
  de Zoom pasa a `manual/sin_clase` (decisión humana explícita). Documentado
  en el contrato de la ruta; test en `zoom-assignment.test.ts`.
- **R7 — `class_session.recording_url` como proyección**: si alguien escribe
  la columna por otro camino sin `recording_source`, el matcher podría tomarla
  como manual (fallo seguro: no pisa). Guard: test que busca escrituras a
  `recordingUrl` fuera de las 2 rutas y `assignment.ts`.

## Complexity Tracking

Sin violaciones que justificar (la nueva dependencia se resuelve por
enmienda, no por excepción).
