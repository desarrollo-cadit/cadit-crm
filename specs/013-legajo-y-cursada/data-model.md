# Data Model — 013 Legajo académico y contenido de cursada

Asume las resoluciones de [research.md](research.md). Si el dueño resuelve
distinto una DV, **este documento se corrige antes de generar la migración**
(misma regla que en 012, donde hizo falta usarla).

## Lo que YA existe y no se toca

Medido antes de proponer nada:

| Tabla | Estado | Qué aporta a esta fase |
|---|---|---|
| `cohort` | 41 filas | `start_time`/`end_time` (texto), `frequency`, `classroom`, `whatsapp_group_link` |
| `class_session` | **0 filas** | `date`, `start_time`, `end_time`, `teacher_id`, `topic`, `canceled_at`, `cancel_reason` |
| `attendance` | — | asistencia por alumno y clase (009) |
| `assessment_result` | — | resultados (010) |
| `certificate` | — | certificados (010) |
| `installment` / `payment` | — | estado de cuenta (008) |
| `course_module` | **0 filas** | temario; queda como referencia OPCIONAL |

`class_session` ya tiene cancelación y horario propio: **no hace falta ninguna
tabla nueva para el calendario real**. Lo que falta son tres columnas y dos
entidades.

## Columnas nuevas sobre tablas existentes

### `organization`

| Columna | Tipo | Nota |
|---|---|---|
| `timezone` | text NOT NULL default `'America/Montevideo'` | IANA (DV-005) |
| `meeting_open_before_min` | integer NOT NULL default `15` | DV-001 / FR-003 |
| `meeting_open_after_min` | integer NOT NULL default `30` | DV-001 / FR-003 |

**Por qué en la organización y no en la cohorte**: CAD IT dicta desde
Montevideo. Ponerlo en la cohorte sería modelar una flexibilidad que nadie
pidió y que habría que llenar 41 veces.

### `cohort`

| Columna | Tipo | Nota |
|---|---|---|
| `meeting_url` | text NULL | FR-001 — enlace por defecto de la cohorte |

### `class_session`

| Columna | Tipo | Nota |
|---|---|---|
| `meeting_url` | text NULL | FR-002 — pisa el de la cohorte para ESA clase |
| `recording_url` | text NULL | FR-005b — la grabación es un ENLACE (FR-005f) |

**Herencia, no copia**: la clase hereda el enlace de su cohorte y solo lo pisa
si tiene el suyo. Copiarlo al generar el cronograma dejaría 41 cohortes con
enlaces desactualizados el día que alguien cambie el de Zoom.

## Entidades nuevas

### `resource` — el material de cursada

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `res_` |
| `organization_id` | text NOT NULL FK | constitución III |
| `course_id` | text NULL FK→course ON DELETE cascade | material del curso: aplica a TODAS sus cohortes |
| `class_session_id` | text NULL FK→class_session ON DELETE cascade | material de una clase puntual |
| `course_module_id` | text NULL FK→course_module ON DELETE set null | referencia OPCIONAL al temario (DV-002) |
| `title` | text NOT NULL | |
| `url` | text NOT NULL | es un ENLACE; el sistema no almacena archivos (FR-007) |
| `kind` | text NOT NULL | `guia`, `ejemplo`, `enlace`, `video` |
| `position` | integer NOT NULL default 0 | orden dentro de su contenedor |
| `created_at` / `updated_at` | timestamp NOT NULL | |

**Índices**: `(organization_id, course_id)`, `(organization_id, class_session_id)`.

**Regla de integridad**: exactamente UNO de `course_id` / `class_session_id`.
Un recurso que no cuelga de nada no se puede mostrar en ninguna pantalla, y uno
que cuelga de los dos aparecería duplicado. Se valida con CHECK **y** en
servidor —mismo criterio que `account_link` en 012: un constraint violado llega
como 500 sin explicación.

**Por qué `course_module_id` es opcional y no el contenedor**: `course_module`
tiene **0 filas**. Atar el material a un temario que nadie cargó lo dejaría
inutilizable desde el día uno (DV-002).

### `announcement` — los avisos por cohorte

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `anc_` |
| `organization_id` | text NOT NULL FK | |
| `cohort_id` | text NOT NULL FK→cohort ON DELETE cascade | destinatario (FR-008) |
| `author_user_id` | text NULL FK→user ON DELETE set null | quién lo publicó |
| `title` | text NOT NULL | |
| `body` | text NOT NULL | |
| `created_at` | timestamp NOT NULL | |

**Índice**: `(organization_id, cohort_id, created_at desc)` — la consulta real
es "los últimos avisos de esta cohorte".

**No notifica** (DV-003): se registra y se ve. El aviso llega con 017. `author`
y `created_at` son el punto: que "no me enteré" deje de ser una discusión.

## El calendario mixto (DV-006, resolución B+C)

No es una tabla: es la forma del DTO.

```
ClassRowDto = {
  projected: boolean      // true = dibujo, false = class_session real
  date, startTime, endTime
  topic, teacherName
  canceled: boolean
  meetingUrl: string | null    // solo dentro de la ventana horaria (FR-003)
  recordingUrl: string | null  // null si está cancelada (FR-005e)
}
```

Una fila **proyectada** no puede cancelarse, no lleva grabación y no registra
asistencia. Es un dibujo derivado de `cohort.frequency` hasta que alguien
genere el cronograma con `generateSchedule()` (009, ya existe).

## Qué NO se toca

- `start_time`/`end_time` siguen siendo **texto**. Migrarlos a `time` sobre 41
  cohortes no compra nada: lo que faltaba era la ZONA, y esa vive en la
  organización. El texto se interpreta en esa zona al componer la fecha real.
- Ninguna tabla de archivos: los recursos son enlaces (decisión marco).
- Las 5 tablas fuera de RLS de 012 siguen fuera; las 4 nuevas/modificadas de
  esta fase entran a RLS como cualquier tabla de dominio.

## Migración

Una sola, aditiva:

1. 3 columnas en `organization`, 1 en `cohort`, 2 en `class_session` — todas
   NULL o con default, así que no tocan ninguna fila existente.
2. `resource` y `announcement` con sus índices y el CHECK.
3. **RLS**: `alter table … enable row level security` + política
   `tenant_isolation` para las dos tablas nuevas. Sin esto nacen sin la red
   que la 012 puso en las otras 31 — y el olvido no se nota hasta que es tarde.
