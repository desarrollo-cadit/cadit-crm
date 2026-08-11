# Phase 1 Data Model: Modelo académico + CRM de ventas (Fase 1)

Todas las tablas nuevas llevan `organization_id NOT NULL` con índice org-first
(Constitución III), siguiendo el patrón exacto de `contact`/`pipelineStage` ya en
`src/lib/db/schema.ts`.

## `course` (nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `crs_` |
| `organization_id` | text NOT NULL → `organization.id` | `onDelete: cascade` |
| `name` | text NOT NULL | p. ej. "Revit" |
| `description` | text | nullable |
| `created_at` / `updated_at` | timestamp NOT NULL | default now |

Índices: `course_org_idx (organization_id)`.

## `cohort` (nueva) — "camada"

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `coh_` |
| `organization_id` | text NOT NULL → `organization.id` | `onDelete: cascade` |
| `course_id` | text NOT NULL → `course.id` | `onDelete: restrict` (no borrar curso con camadas) |
| `start_date` | timestamp NOT NULL | |
| `end_date` | timestamp | nullable |
| `professor` | text | nullable |
| `capacity` | integer | nullable |
| `whatsapp_group_link` | text | nullable |
| `status` | text enum (`planificada`, `en_curso`, `finalizada`) NOT NULL default `planificada` | |
| `created_at` / `updated_at` | timestamp NOT NULL | default now |

Índices: `cohort_org_course_idx (organization_id, course_id)`.

## `enrollment` (reemplaza `lead`) — lead general de ventas O inscripción a una `cohort`

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `enr_` (antes `ld_`) |
| `organization_id` | text NOT NULL → `organization.id` | igual que `lead` hoy |
| `contact_id` | text NOT NULL → `contact.id` | igual que `lead` hoy |
| `cohort_id` | text **NULLABLE** → `cohort.id` | `onDelete: restrict`. **NULL = lead general de ventas** (equivalente al `lead` de hoy); con valor = inscripción a esa camada |
| `stage_id` | text NOT NULL → `pipeline_stage.id` | igual que `lead` hoy (ver DV-001) |
| `position` | integer NOT NULL default 0 | igual que `lead` hoy |
| `enrolled_at` | timestamp | nullable — fecha en que pasó a `inscripto` (solo aplica cuando tiene `cohort_id`) |
| `last_activity_at` | timestamp | igual que `lead` hoy |
| `created_at` / `updated_at` | timestamp NOT NULL | igual que `lead` hoy |

Índices:
- `enrollment_contact_cohort_uq` UNIQUE PARCIAL `(contact_id, cohort_id) WHERE
  cohort_id IS NOT NULL` — una inscripción por contacto y camada.
- `enrollment_contact_general_uq` UNIQUE PARCIAL `(contact_id) WHERE cohort_id IS
  NULL` — un solo lead general por contacto (reemplaza a `lead_contact_uq`, ver
  research.md DV-003).
- `enrollment_org_stage_idx (organization_id, stage_id, position)` — igual que
  `lead_org_stage_idx` hoy.
- `enrollment_org_cohort_idx (organization_id, cohort_id)` — para el filtro del
  tablero por camada (FR-007); también sirve para el filtro `cohort_id IS NULL` del
  tablero general.

**Relaciones**: un `contact` → a lo sumo 1 `enrollment` sin camada (su lead general) +
N `enrollment` con camada (una por `cohort` distinta). Una `cohort` → N `enrollment`.
Cada `enrollment` → exactamente 1 `pipeline_stage` (su etapa actual).

**Transiciones**:
- **De etapa**: la etapa (`stage_id`) se mueve entre las 7 sembradas vía el mismo
  mecanismo de drag&drop / `PATCH /api/pipeline/leads/[id]` que ya existe — sin
  reglas de transición nuevas impuestas por el backend en esta fase.
- **De camada**: `cohort_id` pasa de `NULL` a un valor (o entre valores) vía el mismo
  endpoint (`PATCH /api/pipeline/leads/[id]`, ahora acepta `cohortId` en el body) —
  no crea una fila nueva, no reinicia la etapa (FR-008, DV-007).

## `license` (nueva)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `lic_` |
| `organization_id` | text NOT NULL → `organization.id` | `onDelete: cascade` |
| `enrollment_id` | text NOT NULL UNIQUE → `enrollment.id` | `onDelete: cascade` — 1:0/1:1, se borra con la inscripción |
| `assigned` | boolean NOT NULL default false | |
| `assigned_at` | timestamp | nullable |
| `expires_at` | timestamp | nullable |

Índices: `license_org_idx (organization_id)`.

## `automation_rule` (nueva, solo modelo — sin lógica en esta fase)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `arule_` |
| `organization_id` | text NOT NULL → `organization.id` | `onDelete: cascade` |
| `trigger_event` | text enum (`enrollment_created`, `license_assigned`, `cohort_starts_soon`) NOT NULL | |
| `channel` | text enum (`email`, `whatsapp`) NOT NULL | |
| `template_id` | text | nullable |
| `template_body` | text | nullable |
| `active` | boolean NOT NULL default false | |
| `created_at` / `updated_at` | timestamp NOT NULL | default now |

Índices: `automation_rule_org_idx (organization_id)`. Sin filas sembradas en esta
fase (FR-013).

## `contact` (existente — se agregan columnas)

| Columna nueva | Tipo | Notas |
|---|---|---|
| `source` | text | nullable, texto libre |
| `utm_campaign` | text | nullable |

Sin cambios en columnas existentes (`wa_identity`, `phone`, `wa_user_id`, etc.).

## Resumen de cascadas de borrado (Edge Cases del spec)

- Borrar `course` con `cohort` dependientes → **bloqueado** (`onDelete: restrict`).
- Borrar `cohort` con `enrollment` dependientes → **bloqueado** (`onDelete:
  restrict`) — si hace falta "vaciar" una camada, se reasigna cada `enrollment` a otra
  camada o se vuelve a `cohort_id = NULL` (lead general) antes de borrar.
- Borrar `enrollment` con `license` asociada → **cascada** (`onDelete: cascade`).
- Borrar `pipeline_stage` con `enrollment` dependientes → sin cambios respecto al
  comportamiento actual de `lead` (la API de stages ya exige `moveTo` antes de borrar).
