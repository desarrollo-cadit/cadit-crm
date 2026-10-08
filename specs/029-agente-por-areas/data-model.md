# Data model — 029 Agente por áreas

Migración única: `drizzle/0051_agente_por_areas.sql`. Re-ejecutable
(constitución IV): `if not exists` en tablas/índices/columnas, FKs en `do $$`
contra `pg_constraint`, políticas con `drop policy if exists`, backfill de
capacidad con `@>`. **`db:generate` no escribe RLS**: las tres tablas de dominio
nuevas llevan `enable row level security` + `tenant_isolation` a mano, y
`tests/unit/rls-cobertura.test.ts` las cubre.

Prefijos nanoid nuevos en `src/lib/db/ids.ts`: `areaConfig` → `ac_`,
`areaHandoff` → `ah_`, `areaHandoffEmail` → `ahe_`.

## `area_config` (nueva)

Una fila por organización y área externa.

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | `ac_…` |
| `organization_id` | text NOT NULL FK → organization (cascade) | |
| `area` | text NOT NULL | CHECK `in ('ventas','soporte')` |
| `enabled` | boolean NOT NULL default false | Apagada = `sin_configurar` |
| `mailbox` | text NULL | Casilla compartida (Para). Validada como correo en Zod |
| `cc_emails` | text[] NOT NULL default `{}` | Copias cargadas a mano (máx. 10) |
| `cc_seller_ids` | text[] NOT NULL default `{}` | Vendedores en copia; se resuelven a `seller.email` al enviar. Solo tiene sentido en `ventas` (CHECK `area = 'ventas' or cardinality(cc_seller_ids) = 0`) |
| `contact_text` | text NULL | Texto de cierre al cliente (máx. 600) |
| `office_hours` | jsonb NULL | `{days: number[] /* 0 = lunes, como WEEKDAY_LABELS */, from: "HH:MM", to: "HH:MM"}`. Zona = `organization.timezone` |
| `updated_by` | text NULL FK → user (set null) | |
| `created_at` / `updated_at` | timestamp NOT NULL default now() | |

Índices: `UNIQUE (organization_id, area)`.
RLS: `tenant_isolation` (`organization_id = current_setting('app.current_org')`).

## `area_handoff` (nueva) — el CASO

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | `ah_…` |
| `organization_id` | text NOT NULL FK (cascade) | |
| `conversation_id` | text NOT NULL FK → conversation (cascade) | |
| `contact_id` | text NOT NULL FK → contact (cascade) | |
| `area` | text NOT NULL | CHECK `in ('ventas','soporte')` |
| `case_ref` | text NOT NULL | `AH-` + 6 caracteres; va en el cuerpo del correo |
| `summary` | text NOT NULL | CHECK `length(trim(summary)) > 0` — nunca un caso sin resumen |
| `collected` | jsonb NOT NULL default `{}` | Último snapshot fusionado de datos (ver contrato del agente) |
| `missing` | text[] NOT NULL default `{}` | |
| `status` | text NOT NULL | Estado del ÚLTIMO correo: `pendiente`/`enviado`/`fallido`/`sin_configurar`/`simulado` |
| `subject` | text NOT NULL | Asunto de apertura; el seguimiento usa `RE: ` + esto |
| `graph_conversation_id` | text NULL | Reservado para el hilo real (research DV-005) |
| `is_test` | boolean NOT NULL default false | Copia de `conversation.is_test` |
| `last_activity_at` | timestamp NOT NULL | Base de la ventana de 7 días |
| `created_at` / `updated_at` | timestamp NOT NULL default now() | |

Índices:
- `(organization_id, contact_id, area, last_activity_at DESC)` — "¿hay caso abierto?"
- `(organization_id, conversation_id, created_at DESC)` — panel del inbox.
- `UNIQUE (organization_id, case_ref)`.

RLS: `tenant_isolation`.

**Ventana de seguimiento**: un caso está *abierto* para un contacto y área si
`last_activity_at > now() - interval '7 days'`. La decisión se toma bajo
`pg_advisory_xact_lock(hashtext(organization_id || contact_id || area))`.

## `area_handoff_email` (nueva) — cada correo del caso

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | `ahe_…` |
| `organization_id` | text NOT NULL FK (cascade) | |
| `handoff_id` | text NOT NULL FK → area_handoff (cascade) | |
| `kind` | text NOT NULL | `apertura` \| `seguimiento` |
| `source_message_id` | text NOT NULL FK → message (cascade) | El entrante que disparó el turno |
| `status` | text NOT NULL | `pendiente`/`enviado`/`fallido`/`sin_configurar`/`simulado` |
| `recipients` | jsonb NOT NULL | `{to: string[], cc: string[], replyTo: string \| null, omitted: {sellerId, reason}[]}` |
| `collected_delta` | jsonb NOT NULL default `{}` | Qué agregó este correo (vacío en apertura = todo) |
| `rendered_subject` | text NOT NULL | |
| `error` | text NULL | Mensaje de Graph o "M365 no configurado"; jamás secretos |
| `graph_message_id` / `internet_message_id` | text NULL | Reservado (hilo real) |
| `sent_at` | timestamp NULL | Solo cuando Graph respondió 202 |
| `created_at` / `updated_at` | timestamp NOT NULL default now() | |

Índices: `UNIQUE (handoff_id, source_message_id)` — re-ejecutar el mismo turno
no duplica correo (Principio IV). `(organization_id, status)` para un futuro
listado de fallidos.
RLS: `tenant_isolation`.

> El cuerpo HTML no se persiste: se re-arma al enviar desde la conversación
> (transcripción) y el caso. Excepción: en `simulado` (Laboratorio) tampoco se
> guarda; el Laboratorio verifica el caso, no el HTML.

## Columnas nuevas en tablas existentes

| Tabla | Columna | Tipo | Motivo |
|---|---|---|---|
| `agent_profile` | `area_routing_enabled` | boolean NOT NULL default false | Interruptor del ruteo (DV-012) |
| `teacher` | `wa_identity` | text NULL | Reconocer al profesor por WhatsApp. Normalizada con la misma regla que `contact.wa_identity` (`normalizeMx`). `UNIQUE (organization_id, wa_identity) WHERE wa_identity IS NOT NULL` |
| `message` | `ai_topic` | text NULL | CHECK `in ('ventas','soporte','academia','sin_determinar')`. Solo en salientes `origin='ai'`. Lo leen el Laboratorio y el inbox |
| `agent_test_case` | `routing` | jsonb NULL | Resultado de ruteo del juez + hechos calculados en código |

`teacher`, `message`, `agent_profile` y `agent_test_case` ya tienen RLS.

## Backfill de capacidad

`role.capabilities` de las filas `direccion` existentes: se agrega
`"areas.configurar"` donde no esté (`not capabilities @> '["areas.configurar"]'`).
Mismo precedente que la 0050.

## Entidades derivadas (no persistidas)

- **ContactProfile** — `{kind, alsoTeacher, firstName, teacherId, activeCourses}`
  (research DV-002). Se calcula por turno.
- **LookupResult** — unión discriminada por `query` (contrato de consultas).
  Se registra como `activity_log` `agente.consulta`, sin los datos devueltos.

## Transiciones de estado

### `area_handoff_email.status`

```text
                 ┌── is_test ─────────────► simulado        (terminal)
 (turno) ────────┼── área apagada/sin casilla ► sin_configurar (terminal)
                 └── pendiente ── onAfterCommit ──► enviado (terminal)
                                         └────────► fallido  (terminal en v1)
```

- `pendiente → enviado` solo con 202 de Graph; `sent_at` se escribe en ese
  mismo update (regla de 007: la marca va DESPUÉS de que Graph acepta).
- `pendiente → fallido` con `error`. No hay reintento automático en v1. Una
  fila que queda `pendiente` (el proceso murió entre el commit y el envío) no
  se transiciona sola: la UI la muestra como "sin confirmar" pasados 15 min,
  para que el staff reenvíe a mano. No se pierde en silencio (SC-002).
- `area_handoff.status` refleja el estado del último correo del caso.

### Caso (`area_handoff`)

```text
 sin caso ──derive_area──► abierto (last_activity_at = now)
 abierto ──derive_area con datos nuevos──► abierto (+ correo seguimiento, last_activity_at = now)
 abierto ──derive_area sin datos nuevos──► abierto (sin correo; el agente recuerda que el área ya lo tiene)
 abierto ──7 días sin actividad──► vencido (implícito) ──derive_area──► caso NUEVO
```

"Datos nuevos" = algún campo de `collected` no vacío que difiere del snapshot
del caso, o `missing` que se achicó. Un `summary` reescrito por sí solo NO es
dato nuevo (el modelo parafrasea en cada turno).
