# Data Model: Gestión académica operativa (Fase 2)

Todas las tablas nuevas llevan `organization_id NOT NULL` + índice org-first
(Constitución III). Los campos marcados "Fase 1" ya existen; el resto es nuevo
de esta fase. Decisiones referenciadas como DV-00X → ver `research.md`.

## `software` (nueva)

Catálogo de programas con licencias limitadas (Revit, Civil3D, AutoCAD...).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `sw` |
| `organization_id` | text NOT NULL FK → organization | |
| `name` | text NOT NULL | |
| `total_licenses` | integer NOT NULL default 0 | |
| `created_at` / `updated_at` | timestamp | |

Índice: `(organization_id)`.

**Regla de negocio**: no se puede bajar `total_licenses` por debajo de la
cantidad de `license` con `assigned = true` para ese software (FR-004) — validado
en servidor, no en constraint de base de datos (requiere un `COUNT` contra otra
tabla).

## `teacher` (nueva)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `tch` |
| `organization_id` | text NOT NULL FK → organization | |
| `name` | text NOT NULL | |
| `created_at` / `updated_at` | timestamp | |

Índice: `(organization_id)`.

## `company` (nueva)

Empresa para facturación B2B opcional de una inscripción.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `cia` |
| `organization_id` | text NOT NULL FK → organization | |
| `legal_name` | text NOT NULL | razón social |
| `tax_id` | text NULL | identificación fiscal |
| `created_at` / `updated_at` | timestamp | |

Índice: `(organization_id)`.

## `cohort_software` (nueva, puente N:N)

Qué software(s) declara usar una camada — para poder chequear disponibilidad de
licencias (FR-006).

| Campo | Tipo | Notas |
|---|---|---|
| `cohort_id` | text NOT NULL FK → cohort (cascade) | |
| `software_id` | text NOT NULL FK → software (restrict) | |

Clave primaria compuesta `(cohort_id, software_id)` — sin `id` propio, es una
tabla puente pura.

## `course` (Fase 1, sin cambios)

`id`, `organization_id`, `name`, `description`, `created_at`, `updated_at`. Se
usa `description` para el texto público del endpoint (FR-020); no se agrega
campo nuevo.

## `cohort` (Fase 1, ampliada)

| Campo | Tipo | Notas |
|---|---|---|
| `id` / `organization_id` / `course_id` / `start_date` / `end_date` / `capacity` / `whatsapp_group_link` / `status` | — | Fase 1, sin cambios |
| ~~`professor`~~ | ~~text~~ | **eliminado** — reemplazado por `teacher_id` (DV-005) |
| `teacher_id` | text NULL FK → teacher | reemplaza `professor` |
| `cost` | integer NULL | moneda entera (DV-008, mismo criterio) |
| `frequency` | text NULL | texto libre, ej. "lunes y miércoles 18:30-20:30" |
| `classroom` | text NULL | aula |
| `syllabus_url` | text NULL | URL del temario |

Relación N:N con `software` vía `cohort_software`.

## `enrollment` (Fase 1, ampliada)

| Campo | Tipo | Notas |
|---|---|---|
| `id` / `organization_id` / `contact_id` / `cohort_id` / `stage_id` / `position` / `enrolled_at` / `last_activity_at` | — | Fase 1, sin cambios |
| `amount` | integer NULL | monto total, moneda entera |
| `installments` | integer NULL | cantidad de cuotas |
| `payment_notes` | text NULL | observación libre de cómo va pagando |
| `national_id` | text NULL | cédula del contacto en el momento de inscribir |
| `invoice_number` | text NULL | número de factura |
| `receipt_number` | text NULL | número de recibo |
| `seller_id` | text NULL FK → user | vendedor; validado como miembro de la org (DV-008) |
| `company_id` | text NULL FK → company (restrict) | facturación B2B opcional |
| `terms_email_sent_at` | timestamp NULL | checklist soporte |
| `software_installed_at` | timestamp NULL | checklist soporte |
| `had_own_license` | boolean NOT NULL default false | checklist soporte |
| `academia_online_access_at` | timestamp NULL | checklist soporte |

"Licencia asignada" del checklist NO vive acá — se lee de `license.assigned` /
`license.assigned_at` (ver abajo).

## `license` (Fase 1, ampliada)

| Campo | Tipo | Notas |
|---|---|---|
| `id` / `organization_id` / `enrollment_id` (unique) / `assigned` / `assigned_at` / `expires_at` | — | Fase 1, sin cambios |
| `software_id` | text NOT NULL FK → software (restrict) | de qué software es esta licencia |

**Regla de negocio**: `assigned = true` solo si `count(license WHERE
software_id = X AND assigned = true) < software.total_licenses` en el momento de
asignar (FR-003) — validado en servidor.

## `contact` (Fase 1/003, ampliada)

| Campo | Tipo | Notas |
|---|---|---|
| ... campos existentes ... | — | sin cambios |
| `email` | text NULL | nuevo — único por organización cuando no es NULL (DV-003) |
| `national_id` | text NULL | cédula — sin constraint de unicidad (no pedido en spec) |

Nuevos índices únicos parciales:
- `contact_org_email_uq` (`organization_id`, `email`) `WHERE email IS NOT NULL`
- `contact_org_phone_uq` (`organization_id`, `phone`) `WHERE phone IS NOT NULL`

## `member` (Better Auth, sin cambio de esquema)

`role` (text, ya existente) gana el valor posible `"soporte"` a nivel de
aplicación — sin migración, ver DV-001.

## Relaciones (resumen)

```text
organization 1───N course 1───N cohort N───N software (vía cohort_software)
                                  │                        │
                                  │                        │ 1
                                  │ N                       │
                              enrollment N──1 contact       │
                                  │ 1                        │
                                  │                          │
                              license N────────────────────┘ (software_id)
enrollment N──1 company (opcional)
enrollment N──1 user (seller_id, opcional)
cohort N──1 teacher (opcional)
```

## Validaciones de negocio (fuera del esquema, en servidor)

- No bajar `software.total_licenses` por debajo de licencias `assigned` (FR-004).
- No asignar una licencia si no queda pool disponible (FR-003).
- Advertencia (no bloqueo) si el cupo de una camada supera las licencias
  disponibles de su software declarado (FR-006).
- Advertencia (no bloqueo) si un profesor queda con camadas de fechas
  superpuestas (FR-008).
- `seller_id`, si viene, debe ser un `user_id` con membresía activa en
  `session.organizationId`.
- El endpoint público (`/api/public/courses*`) nunca lee `contact`, `enrollment`
  ni ningún campo de `license`/`software` más allá de lo estrictamente necesario
  para "próximos comienzos" (fecha de inicio).
