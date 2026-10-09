# Research — 030 Grabaciones de Zoom

**Creado**: 2026-10-08 · Depende de 012 (RLS, capacidades), 013 (`classInstant`,
`recording_url`), 023/025 (aulas = cuentas; enlace por cohorte), 029 (patrón de
mock de proveedor externo + base URL por entorno), todas implementadas.

> Los datos de la API de Zoom que siguen salen de la documentación pública de
> Zoom (API v2, Server-to-Server OAuth, granular scopes) a la fecha. Los
> marcados **[verificar en vivo]** se confirman en el paso 6 de
> [quickstart.md](quickstart.md) contra la cuenta real antes de encender la
> sincronización periódica.

## Lo que el código YA tiene y lo que NO (medido antes de decidir)

| Qué | Estado hoy | Consecuencia para la fase |
|---|---|---|
| Grabación de una clase | `class_session.recording_url` (texto, URL). La cargan coordinación (`PATCH /api/class-sessions/[id]/links`, `academico.editar`) y el profesor (`PUT /api/portal/classes/[id]/recording`). | Es el ÚNICO dato que leen los 7 callers de `buildClassRow` y los portales. La fase lo LLENA; no inventa un segundo campo que leer (DV-007). |
| Origen de la grabación | No se registra: no hay forma de saber si un `recording_url` lo pegó una persona. | Se agrega `class_session.recording_source` para que la automática nunca pise lo manual (DV-007). |
| Aula virtual | `virtual_room` = nombre + `url` (PMI) + `account_email` + baja lógica. Sin vínculo a Zoom. | Gana `zoom_connection_id` + `zoom_user_id` (DV-002). |
| Enlace de reunión | 025: la cohorte tiene su **reunión recurrente** (`cohort.meeting_url`); la clase puede pisarla (`class_session.meeting_url`). Cadena en `resolveMeetingUrl` (clase → cohorte). | La señal MÁS fuerte para adjudicar es el número de reunión dentro de esa URL (DV-006). |
| Aula efectiva | `class_session.virtual_room_id ?? cohort.virtual_room_id` (agenda de aulas, choques). | Señal de respaldo: anfitrión de la grabación = usuario vinculado al aula (DV-006). |
| Horario de clase | `classInstant(date, "HH:MM", org.timezone)` — único lugar, probado contra cambio de hora. 6/41 cohortes sin horario. | La ventana de tolerancia se compone sobre instantes; sin horario no hay candidata. |
| Secretos cifrados | `lib/crypto` (`encryptSecret`/`decryptSecret`, AES-256-GCM); `meta_credentials` guarda `token_cipher/iv/tag`. | Mismo patrón para el Client Secret (DV-003). |
| Trabajo en segundo plano | In-process: `onAfterCommit()`, `withOrganizationScope(org, actor, fn)` (una transacción). `instrumentation-node.ts` solo limpia corridas huérfanas al arrancar. **No hay programador periódico.** | Nace un programador mínimo en `instrumentation-node.ts` (DV-004). |
| Mock de proveedor | m365-mock (029): base URL por entorno, estado en `src/server/dev/*-mock-state.ts`, `mockGuard()`. | zoom-mock con el mismo patrón (DV-011). |
| Capacidades | Lista cerrada en `src/lib/capabilities.ts`; backfill en migración con `@>` (precedente 0050/0051). | Dos capacidades nuevas (DV-009). |

---

## DV-001 — Server-to-Server OAuth, una app por cuenta de Zoom

**Decision**: autenticación **Server-to-Server OAuth** ("account credentials").
Token: `POST https://zoom.us/oauth/token?grant_type=account_credentials&account_id=<ACCOUNT_ID>`
con `Authorization: Basic base64(client_id:client_secret)`. El token dura 1 h;
se cachea en memoria **por conexión** con 60 s de margen (mismo criterio que
`src/lib/m365`). Un 401 en una llamada invalida el token cacheado y reintenta
una vez.

**Rationale**: es la opción que no requiere que cada usuario autorice ni
guardar refresh tokens; es la que Zoom recomienda para integraciones internas
de una cuenta. Ya lo había propuesto 018 (DV-002).

**Alternatives considered**: app OAuth de usuario (marketplace) — exige
consentimiento por usuario y manejo de refresh tokens; JWT app — deprecada por
Zoom (junio 2023).

## DV-002 — Topología desconocida: conexión → usuarios → aulas

**Decision**: entidad `zoom_connection` (credenciales de UNA cuenta de Zoom) y
el aula guarda `(zoom_connection_id, zoom_user_id)`. "Probar conexión" llama a
`GET /users?status=active&page_size=300` y ofrece la lista para vincular.

- 1 organización de Zoom con 5 usuarios → 1 conexión, 5 aulas apuntan a ella.
- 5 cuentas separadas → 5 conexiones (una app S2S en cada cuenta), cada aula a la suya.

Sin bandera de "modo": el código solo itera conexiones activas y, dentro de
cada una, los usuarios vinculados a aulas activas.

**Rationale**: el dueño no sabe cuál es el caso; un modelo que los cubre a los
dos es más barato que preguntar y equivocarse. Guardar `zoom_user_id` (no el
correo) sobrevive a un cambio de correo del usuario en Zoom; se guarda además
`zoom_user_email` como rótulo.

**Alternatives considered**: credenciales en el aula (5 pares aunque sea una
sola cuenta → secretos duplicados); credenciales por entorno como M365
(imposible representar N cuentas sin N variables y redeploy).

## DV-003 — Credenciales en la base, cifradas; no en entorno

**Decision**: `client_secret` cifrado con `encryptSecret` en tres columnas
(`client_secret_cipher/iv/tag`, mismo formato que `meta_credentials`) +
`client_secret_last4` en claro para mostrar `••••1234`. Account ID y Client ID
en claro (no son secretos por sí solos, pero tampoco viajan a logs). Edición:
campo vacío = conservar. Ninguna respuesta de API incluye el secreto ni el
cifrado. Los errores de Zoom se traducen a mensajes propios
(`credenciales_invalidas`, `sin_permiso`, `limite_de_tasa`, `zoom_caido`) antes
de guardarse en `last_error`.

**Rationale**: Principio I. Las credenciales las carga dirección desde la UI
(US4) sin redeploy, igual que WhatsApp.

**Alternatives considered**: variables `ZOOM_*` por entorno — no escala a N
conexiones y obliga a redeploy.

## DV-004 — Sincronización in-process: lease en base + programador mínimo

**Decision**:

1. **Disparadores**: botón (`POST /api/recordings/sync`) y un temporizador en
   `instrumentation-node.ts` cada `ZOOM_SYNC_INTERVAL_MIN` (default 60; `0`
   apaga). El temporizador solo arranca si existe al menos una conexión activa
   al momento del tick (lectura barata), con `setInterval(...).unref()`.
2. **Un solo corredor por organización** con un **lease persistido**:
   `zoom_sync_state(organization_id PK, lease_owner, lease_until, …)`. Tomar el
   lease es un `UPDATE … SET lease_owner=$me, lease_until=now()+15min WHERE
   organization_id=$org AND (lease_until IS NULL OR lease_until < now())
   RETURNING` en una transacción corta. Si no devuelve fila, ya hay una corrida:
   el botón responde 409 con desde cuándo. Se renueva al terminar cada aula y se
   libera al final (o vence solo si el proceso muere).
3. **Sin transacciones largas**: las llamadas HTTP a Zoom van FUERA de
   transacción; cada página de resultados se persiste en su propio
   `withOrganizationScope(org, "system:zoom-sync", …)` corto (upsert + matcher).
4. **Estado durable**: `zoom_connection.synced_through` (fecha hasta la que la
   conexión está al día) y `zoom_sync_run` (bitácora por corrida y conexión).
5. **Ventana de recuperación**: `from = (synced_through ?? hoy − ZOOM_SYNC_BACKFILL_DAYS) − ZOOM_SYNC_OVERLAP_DAYS`, `to = hoy` (zona UTC, granularidad día).
   `synced_through` solo avanza cuando TODAS las aulas de la conexión terminaron
   bien; un error deja la ventana como estaba y la próxima corrida reintenta.
6. **Idempotencia**: upsert por `UNIQUE(organization_id, zoom_connection_id, zoom_meeting_uuid)`.

**Rationale**: la constitución prohíbe colas externas; el CRM puede correr con
más de un proceso (rolling deploy en Coolify). El lease en una fila es
observable (la UI dice "corriendo desde 10:42"), sobrevive a reinicios (vence
solo) y no retiene una conexión del pool durante minutos de HTTP.

**Alternatives considered**:
- `pg_advisory_lock` de sesión — exige sostener UNA conexión del pool durante
  toda la corrida (incluido el HTTP a Zoom) y no es visible desde la UI; con
  `postgres-js` + pool, el lock de sesión se libera o se pierde si la conexión
  se recicla. `pg_try_advisory_xact_lock` obliga a una transacción larga.
  Se usa, sí, `pg_advisory_xact_lock` dentro de la transacción corta de cada
  ADJUDICACIÓN por clase (DV-006), donde es la herramienta justa.
- Cron del sistema operativo / Coolify scheduled task llamando a un endpoint —
  agrega configuración en el instalador; queda como alternativa documentada
  (`POST /api/recordings/sync` con sesión de staff no sirve para un cron, y un
  token de cron sería una credencial más).

## DV-005 — Polling vs webhook `recording.completed`

**Decision**: **polling** (DV-004) en esta fase. Webhook queda como mejora
futura, sin bloquearla: el upsert idempotente es el mismo y un webhook solo
adelantaría el momento.

**Rationale**:

| Criterio | Polling | Webhook `recording.completed` |
|---|---|---|
| Infra | Ninguna nueva | Endpoint público, `x-zm-signature` (HMAC-SHA256 de `v0:{x-zm-request-timestamp}:{body}` con el Secret Token), handshake `endpoint.url_validation` (responder `plainToken` + `encryptedToken`), Secret Token por app = otro secreto por conexión |
| Pérdidas | No pierde: la ventana re-consulta | Zoom reintenta pocas veces; caído el servidor, se pierde → igual hace falta polling de respaldo |
| Latencia | ≤ intervalo (60 min) | Segundos |
| Prueba local | Mock trivial | Túnel (ngrok) + firma |
| 5 cuentas separadas | Igual | 5 suscripciones a configurar en 5 apps |

La latencia de una hora es irrelevante para una grabación que el alumno mira
al día siguiente; el webhook solo no basta (hay que poder recuperar), y sumarlo
duplica superficie de seguridad.

**Alternatives considered**: webhook + polling de respaldo (mejor latencia,
doble superficie; diferido).

## DV-006 — Algoritmo de adjudicación

**Decision** (contrato completo en [contracts/adjudicacion.md](contracts/adjudicacion.md)):

1. **Universo**: clases reales (`class_session`), no canceladas, con
   `start_time` y `classInstant(...)` no nulo. Las proyecciones no son filas:
   nunca son candidatas.
2. **Ventana**: grabación con inicio `r` es compatible con clase `[s, e]` si
   `s − 30 min ≤ r ≤ (e ?? s + 180 min)`. (`ZOOM_MATCH_BEFORE_MIN`, `ZOOM_MATCH_AFTER_FALLBACK_MIN`.)
3. **Señal A (fuerte)**: número de reunión de la grabación = número extraído de
   la reunión efectiva de la clase (`resolveMeetingUrl` clase → cohorte;
   parseo `/j/<digits>` o `/my/<vanity>` no se resuelve). Candidatas A = clases
   compatibles con esa señal.
4. **Señal B (respaldo)**: si A está vacía, candidatas B = clases compatibles
   cuya aula efectiva (`class.virtual_room_id ?? cohort.virtual_room_id`) está
   vinculada al usuario anfitrión de la grabación (por conexión + `host_id`), o
   cuyo número de reunión coincide con el PMI del aula (parseado de `virtual_room.url`).
5. **Resultado**: 1 candidata → adjudicar (`auto`); ≥2 → `ambigua` con la lista;
   0 → `sin_clase`.
6. **Guardas al adjudicar** (dentro de `pg_advisory_xact_lock(hashtext('rec:'||class_id))`):
   si la clase tiene `recording_source = 'manual'` con URL, o ya tiene otra
   grabación adjudicada → `conflicto` (la grabación guarda `conflict_class_session_id`), no se pisa.
7. **Modo manual**: `assignment_mode = 'manual'` congela la grabación; el
   matcher la saltea siempre.
8. **Re-evaluación**: una grabación `auto` en estado `sin_clase`/`ambigua`/
   `conflicto` se re-evalúa en cada sincronización (p. ej. alguien generó el
   cronograma después). Una `auto` ya `asignada` NO se re-evalúa (estabilidad:
   no se mueve sola).

**Rationale**: 025 estableció que cada cohorte tiene su reunión recurrente:
el número de reunión identifica la COHORTE aunque dos cohortes compartan
cuenta, y desambigua solo. El aula/anfitrión cubre cohortes que dictan en el
PMI o sin reunión cargada (hoy 0/41 la tienen). Preferir no adjudicar ante
ambigüedad es la regla "mejor ningún enlace que el equivocado" de 025.

**Alternatives considered**: tomar la candidata más cercana en tiempo —
convierte un choque de aulas en una grabación de otra cohorte frente a un
alumno (SC-002); comparar por `topic` de Zoom — texto libre, no confiable.

## DV-007 — Dónde vive el enlace adjudicado: se escribe en `class_session.recording_url`

**Decision**: la adjudicación ESCRIBE `class_session.recording_url` con el
enlace compartible y `recording_source = 'zoom'`; la grabación guarda
`class_session_id`. Desadjudicar limpia la clase solo si `recording_source =
'zoom'` y el enlace es el de esa grabación. Las dos rutas existentes de carga
manual pasan a escribir `recording_source = 'manual'` (o `NULL` si borran).
Asignar a mano desde Grabaciones sobre una clase con enlace manual exige
`replace: true` explícito.

**Rationale**: los 7 callers de `buildClassRow`, los DTO del portal del
profesor y del alumno y la regla "cancelada no ofrece grabación" quedan
INTACTOS: no hay ruta nueva de portal (FR-025) ni join nuevo en lecturas
calientes. El estado de verdad de la adjudicación está en `zoom_recording`;
la columna de la clase es su proyección para lectura.

**Alternatives considered**: resolver en lectura (`recording_url ??
zoom_recording.share_url`, como `resolveMeetingUrl`) — obliga a tocar 7
callers + 2 portales y agrega un join a cada lista de clases; tabla puente
clase↔grabación N:N — la clase muestra UNA grabación, el N:N no aporta.

## DV-008 — Código de acceso (passcode) y enlace compartible

**Decision**: de `GET /users/{userId}/recordings` se toman, por reunión,
`share_url`, `recording_play_passcode` y `password`.

- **Enlace para la clase y para "Copiar"**: si `share_url` ya trae `pwd=` →
  tal cual. Si no lo trae y hay `recording_play_passcode` → se agrega
  `?pwd=<recording_play_passcode>` (es el formato que genera el propio Zoom
  con "Embed passcode in the shareable link"). **[verificar en vivo]**
- Si no hay ninguno de los dos → `share_url` tal cual y, si hay `password`, se
  muestra al staff junto al enlace con su propio botón de copiar.
- El passcode se guarda **cifrado** (`lib/crypto`) igual: no es una credencial
  de integración, pero abre contenido de clase a quien lo tenga; solo se
  descifra para armar el enlace y para el staff con `grabaciones.ver`.

**Rationale**: el alumno abre UN enlace (el portal muestra `recordingUrl`, no
un código aparte); el staff necesita el código cuando Zoom no lo embebió.

**Alternatives considered**: mostrar siempre enlace + código por separado al
alumno — exige cambiar DTOs y portales; pedir a la academia que active el
embebido en Zoom — se recomienda igual en quickstart, pero no se depende de eso.

## DV-009 — Capacidades

**Decision**: dos nuevas en la lista cerrada:

- `grabaciones.ver` — la sección, la tabla, copiar/abrir enlaces, ver el código.
- `grabaciones.gestionar` — sincronizar, asignar, desasignar, volver a automático.

Las **conexiones** de Zoom y el vínculo aula ↔ usuario de Zoom usan
`configuracion.editar` (igual que las credenciales de WhatsApp: es configuración
de la plataforma con secretos). El listado de aulas ya usa `academico.ver`;
vincular un usuario de Zoom a un aula se hace desde la pantalla de conexiones.

Siembra (`SYSTEM_ROLES` + backfill en la migración): `direccion` y
`coordinacion` reciben ambas; `soporte` recibe `grabaciones.ver` (no
`gestionar`); `owner`/`member` del respaldo, todas (como hoy).

**Rationale**: separar ver de gestionar permite a soporte pasar un enlace a un
alumno sin poder mover adjudicaciones. No reusar `academico.editar` para
gestionar: hoy la tiene soporte, y adjudicar en lote es más que editar una
clase. Una capacidad propia para conexiones sería una tercera sin un rol que la
necesite separada de `configuracion.editar`.

**Alternatives considered**: una sola `grabaciones.gestionar`; reusar
`academico.ver/editar` (pierde la distinción y daría la sección a todo el que
ve académico).

## DV-010 — Límites de tasa y paginación de Zoom

**Decision**:

- `GET /users/{userId}/recordings?from=YYYY-MM-DD&to=YYYY-MM-DD&page_size=300&next_page_token=…`.
  **Rango máximo por pedido: 1 mes** → la ventana se parte en tramos de ≤ 30
  días; cada tramo pagina con `next_page_token` hasta vacío.
- `GET /users?status=active&page_size=300` (paginado igual) para "Probar".
- **Límite de tasa**: List recordings es categoría *Medium* (por cuenta, por
  segundo, según plan; Pro ≈ decenas de req/s **[verificar en vivo]**). Con 5
  usuarios y ventanas de días el volumen es ínfimo; igual: pedidos en SERIE
  por conexión, ≤ 5 req/s, y ante `429` se respeta `Retry-After` (o
  `X-RateLimit-*`), backoff exponencial con jitter, máx. 3 reintentos; `5xx`
  igual; `401` invalida token y reintenta 1 vez; `4xx` restantes → error del
  aula sin reintento. Un fallo aísla al aula/conexión, nunca tumba la corrida
  entera.
- Zoom solo devuelve grabaciones ya procesadas y no las de la papelera
  (`trash=false` por defecto). **Antigüedad consultable**: la API limita cuán
  atrás se puede pedir **[verificar en vivo]**; el backfill de 90 días queda
  dentro de lo usual.
- `auto_delete_date` (si la cuenta tiene borrado automático) se guarda y se
  muestra como vencimiento.

**Rationale**: mínima complejidad que respeta los límites documentados.

## DV-011 — Mock de Zoom

**Decision**: `src/app/api/dev/zoom-mock/[...path]` detrás de `mockGuard()`,
estado en `src/server/dev/zoom-mock-state.ts`. El adaptador lee
`ZOOM_API_BASE_URL` (default `https://api.zoom.us/v2`) y `ZOOM_OAUTH_BASE_URL`
(default `https://zoom.us`). El mock implementa token, `/users`,
`/users/{id}/recordings` (con filtro de fechas, rango > 31 días → 400 como Zoom,
paginación con `next_page_token` y `page_size` chico forzable) y controles
`seed`, `reset`, `fail` (`401`/`429`/`500` por N pedidos). Sin `if (mock)` en
el dominio.

**Rationale**: patrón ya probado con wa-mock y m365-mock (029); permite que el
arnés E2E ejerza los caminos infelices (429 con `Retry-After`, credenciales
inválidas).

## DV-012 — Qué usuarios de Zoom se sincronizan

**Decision**: solo los vinculados a un aula ACTIVA. Un aula archivada deja de
sincronizarse; sus grabaciones ya traídas se conservan.

**Rationale**: en una organización de Zoom compartida podría haber usuarios
cuyas grabaciones no son de la academia (personales, reuniones internas): no
traerlas es minimizar datos. Es un default: el dueño puede pedir "todo lo de
la cuenta" (pregunta abierta en plan.md); el cambio sería iterar `/users` en
vez de aulas, sin tocar el esquema.

## DV-013 — La grabación desaparece de Zoom

**Decision**: cada corrida marca `last_seen_at` en lo que ve. Si una grabación
con `start_time` DENTRO de la ventana consultada de un aula que terminó bien no
apareció, se marca `missing_in_zoom_at` (no se borra, no se desadjudica). La
tabla la muestra como "ya no está en Zoom"; si reaparece, se limpia la marca.

**Rationale**: borrar adjudicaciones automáticamente cambiaría lo que ven los
alumnos sin decisión humana; esconder el problema es el riesgo DV-005 de 018.
