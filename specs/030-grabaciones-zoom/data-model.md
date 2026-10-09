# Data model — 030 Grabaciones de Zoom

Migración única: `drizzle/0052_grabaciones_zoom.sql`. Re-ejecutable
(constitución IV): `if not exists` en tablas/índices/columnas, FKs en `do $$`
contra `pg_constraint`, políticas con `drop policy if exists`, backfill de
capacidades con `@>`. **`db:generate` no escribe RLS**: las cuatro tablas de
dominio nuevas llevan `enable row level security` + `tenant_isolation` a mano,
y `tests/unit/rls-cobertura.test.ts` las cubre.

Prefijos nanoid nuevos en `src/lib/db/ids.ts`: `zoomConnection` → `zc_`,
`zoomRecording` → `zr_`, `zoomSyncRun` → `zsr_`. (`zoom_sync_state` usa
`organization_id` como PK.)

## `zoom_connection` (nueva)

Credenciales de UNA cuenta de Zoom (app Server-to-Server OAuth). Cubre uno o
muchos usuarios de Zoom (research DV-002).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | `zc_…` |
| `organization_id` | text NOT NULL FK → organization (cascade) | |
| `name` | text NOT NULL | Rótulo: "Zoom academia", "Cuenta 3". UNIQUE (org, name) |
| `account_id` | text NOT NULL | Account ID de la app S2S. UNIQUE (org, account_id): la misma cuenta no se conecta dos veces |
| `client_id` | text NOT NULL | |
| `client_secret_cipher` / `client_secret_iv` / `client_secret_tag` | text NOT NULL | `encryptSecret()` (AES-256-GCM). Jamás en respuestas ni logs |
| `client_secret_last4` | text NOT NULL | Lo único que se muestra (`••••1234`) |
| `status` | text NOT NULL default `'sin_probar'` | CHECK `in ('sin_probar','ok','error')` |
| `last_error` | text NULL | Código propio + mensaje legible (`credenciales_invalidas`, `sin_permiso`, `limite_de_tasa`, `zoom_caido`, `usuario_inexistente`). Nunca la respuesta cruda |
| `last_tested_at` | timestamp NULL | |
| `last_sync_at` | timestamp NULL | Fin de la última corrida (cualquier resultado) |
| `synced_through` | date NULL | Fecha (UTC) hasta la que la conexión está al día. Solo avanza si todas sus aulas terminaron bien (DV-004) |
| `archived_at` | timestamp NULL | Baja lógica: no se sincroniza; grabaciones conservadas |
| `created_by` | text NULL FK → user (set null) | |
| `created_at` / `updated_at` | timestamp NOT NULL default now() | |

Índices: `zoom_connection_org_idx (organization_id)`,
`zoom_connection_org_name_uq`, `zoom_connection_org_account_uq`.

## `virtual_room` (modificada)

| Columna nueva | Tipo | Notas |
|---|---|---|
| `zoom_connection_id` | text NULL FK → zoom_connection (set null) | |
| `zoom_user_id` | text NULL | `id` del usuario en Zoom (estable ante cambio de correo) |
| `zoom_user_email` | text NULL | Rótulo; se refresca al "Probar" |

CHECK `(zoom_connection_id is null) = (zoom_user_id is null)`: se vinculan
juntos o ninguno. Índice parcial UNIQUE `(organization_id, zoom_connection_id,
zoom_user_id) where zoom_user_id is not null and archived_at is null`: un
usuario de Zoom hospeda a lo sumo un aula activa (si no, la señal B del matcher
sería ambigua por construcción).

## `class_session` (modificada)

| Columna nueva | Tipo | Notas |
|---|---|---|
| `recording_source` | text NULL | CHECK `in ('manual','zoom')`. `NULL` cuando `recording_url` es NULL |

Backfill: `update class_session set recording_source = 'manual' where
recording_url is not null and recording_source is null` — todo lo existente lo
pegó una persona. Las rutas `PATCH /api/class-sessions/[id]/links` y `PUT
/api/portal/classes/[id]/recording` pasan a escribir `'manual'` (o `NULL` al
borrar). `recording_url` sigue siendo LA columna que leen `buildClassRow` y los
portales (research DV-007).

## `zoom_recording` (nueva)

Una fila por **instancia de reunión grabada** (no por archivo: el enlace
compartible es de la reunión).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | `zr_…` |
| `organization_id` | text NOT NULL FK → organization (cascade) | |
| `zoom_connection_id` | text NOT NULL FK → zoom_connection (restrict) | Una conexión con grabaciones se archiva, no se borra |
| `virtual_room_id` | text NULL FK → virtual_room (set null) | Aula de la que se trajo (usuario vinculado al momento de traerla) |
| `zoom_meeting_uuid` | text NOT NULL | Instancia (`uuid`). **Llave de idempotencia** |
| `zoom_meeting_id` | text NOT NULL | Número de reunión (`id`), como texto (supera 2^53 en algunos casos) |
| `host_zoom_user_id` | text NOT NULL | `host_id` |
| `host_email` | text NULL | |
| `topic` | text NULL | Tema en Zoom (rótulo, no se usa para adjudicar) |
| `start_time` | timestamptz NOT NULL | UTC, tal cual Zoom |
| `duration_min` | integer NULL | |
| `total_size_bytes` | bigint NULL | |
| `file_count` | integer NULL | |
| `share_url` | text NULL | Tal cual Zoom |
| `play_url` | text NULL | Enlace final para clase/copiar (DV-008: `share_url` + `pwd` si corresponde). NULL si no hay `share_url` |
| `passcode_cipher` / `passcode_iv` / `passcode_tag` | text NULL | Código de acceso cifrado (DV-008) |
| `passcode_embedded` | boolean NOT NULL default false | `play_url` ya lleva el código |
| `auto_delete_date` | date NULL | Vencimiento informado por Zoom |
| `first_seen_at` / `last_seen_at` | timestamp NOT NULL | |
| `missing_in_zoom_at` | timestamp NULL | DV-013 |
| `class_session_id` | text NULL FK → class_session (set null) | Clase adjudicada |
| `assignment_mode` | text NOT NULL default `'auto'` | CHECK `in ('auto','manual')`. `manual` = el matcher no la toca nunca |
| `assignment_state` | text NOT NULL default `'pendiente'` | CHECK `in ('pendiente','asignada','ambigua','conflicto','sin_clase')`. Con `manual`: solo `asignada` o `sin_clase` |
| `candidate_class_ids` | text[] NOT NULL default `{}` | Candidatas de la última evaluación (ambigua) |
| `conflict_class_session_id` | text NULL FK → class_session (set null) | Clase que la habría recibido (conflicto) |
| `assigned_by` | text NULL FK → user (set null) | Manual: quién. Auto: NULL |
| `assigned_at` | timestamp NULL | |
| `created_at` / `updated_at` | timestamp NOT NULL default now() | |

Restricciones:
- UNIQUE `(organization_id, zoom_connection_id, zoom_meeting_uuid)` — upsert.
- UNIQUE parcial `(organization_id, class_session_id) where class_session_id is not null` — una clase, una grabación adjudicada (la clase muestra UNA).
- CHECK `(assignment_state = 'asignada') = (class_session_id is not null)`.

Índices: `(organization_id, start_time desc)` (tabla y filtro de fechas),
`(organization_id, virtual_room_id, start_time desc)`,
`(organization_id, assignment_state)`, `(organization_id, zoom_meeting_id)`.

Transiciones (`assignment_mode`/`assignment_state`):

```text
auto/pendiente ──matcher──► auto/asignada | auto/ambigua | auto/conflicto | auto/sin_clase
auto/{ambigua,conflicto,sin_clase} ──matcher (cada sync)──► re-evalúa
auto/asignada ──matcher──► (sin cambio: estable)
* ──asignar a mano──► manual/asignada
* ──desasignar──► manual/sin_clase
manual/* ──"volver a automático"──► auto/pendiente (y se re-evalúa)
```

Efecto sobre la clase (misma transacción, con
`pg_advisory_xact_lock(hashtext('rec:' || class_session_id))`):
- `→ asignada`: `class_session.recording_url = play_url`, `recording_source = 'zoom'`.
- `asignada → otra cosa`: si `class_session.recording_source = 'zoom'` y `recording_url = play_url` → ambos `NULL`.
- Asignación manual con `replace: true` sobre clase con otra grabación: la otra pasa a `manual/sin_clase`.

## `zoom_sync_state` (nueva)

Lease de "una sincronización por organización a la vez" (DV-004).

| Columna | Tipo | Notas |
|---|---|---|
| `organization_id` | text PK FK → organization (cascade) | |
| `lease_owner` | text NULL | `<hostname>:<pid>:<nanoid>` |
| `lease_until` | timestamp NULL | Vence solo si el proceso muere (15 min, renovado por aula) |
| `current_run_started_at` | timestamp NULL | Lo que dice la UI: "corriendo desde…" |
| `updated_at` | timestamp NOT NULL default now() | |

## `zoom_sync_run` (nueva)

Bitácora: una fila por corrida y conexión.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | `zsr_…` |
| `organization_id` | text NOT NULL FK → organization (cascade) | |
| `zoom_connection_id` | text NOT NULL FK → zoom_connection (cascade) | |
| `trigger` | text NOT NULL | CHECK `in ('manual','periodica')` |
| `triggered_by` | text NULL FK → user (set null) | |
| `window_from` / `window_to` | date NOT NULL | |
| `status` | text NOT NULL | CHECK `in ('corriendo','ok','parcial','error')` |
| `fetched_count` / `new_count` / `assigned_count` / `ambiguous_count` / `conflict_count` | integer NOT NULL default 0 | |
| `error` | text NULL | Mensaje propio, sin datos sensibles; por aula si `parcial` |
| `started_at` | timestamp NOT NULL default now() | |
| `finished_at` | timestamp NULL | |

Índice `(organization_id, zoom_connection_id, started_at desc)`. Retención:
se conservan las últimas 200 por conexión (poda al cerrar una corrida). Al
arrancar el servidor, las `corriendo` huérfanas pasan a `error` ("Interrumpida
por un reinicio"), como las corridas del Laboratorio.

## RLS (a mano en 0052)

```sql
alter table "zoom_connection" enable row level security;
drop policy if exists tenant_isolation on "zoom_connection";
create policy tenant_isolation on "zoom_connection"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
-- idem: zoom_recording, zoom_sync_state, zoom_sync_run
```

(Mismo texto que 0051 — copiar la forma exacta de la política de allí.)

## Capacidades (backfill en 0052)

`role.capabilities` (jsonb) de roles de sistema existentes, con `@>` para no
duplicar:
- `direccion`, `coordinacion`: `+ grabaciones.ver`, `+ grabaciones.gestionar`.
- `soporte`: `+ grabaciones.ver`.
