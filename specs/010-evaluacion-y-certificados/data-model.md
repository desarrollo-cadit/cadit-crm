# Data Model — Evaluación y certificados

## `assessment` — la evaluación

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `asm_` |
| `organization_id` | text NOT NULL FK→organization | |
| `cohort_id` | text NOT NULL FK→cohort ON DELETE cascade | |
| `name` | text NOT NULL | "Trabajo final", "Parcial 1" |
| `weight` | integer NOT NULL | porcentaje; la suma por camada debe dar 100 |
| `max_score` | integer NOT NULL | ver DV-001 |
| `position` | integer NOT NULL | orden de aparición |
| `created_at` / `updated_at` | timestamp NOT NULL | |

**Índice**: `(organization_id, cohort_id, position)`.

Vive en la camada y no en el curso porque dos ediciones del mismo curso pueden
evaluarse distinto —la in-company suele no tener parcial—. Si en la práctica
siempre coinciden, el atajo es copiar las evaluaciones del curso al crear la
camada, no mover la tabla.

## `assessment_result` — la nota

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `res_` |
| `organization_id` | text NOT NULL FK→organization | |
| `assessment_id` | text NOT NULL FK→assessment ON DELETE cascade | |
| `enrollment_id` | text NOT NULL FK→enrollment ON DELETE cascade | |
| `score` | integer NULL | NULL = pendiente, NO reprobado (FR-005) |
| `notes` | text NULL | |
| `recorded_by` | text NULL FK→user ON DELETE set null | |
| `updated_at` | timestamp NOT NULL | |

**Índice**: `(assessment_id, enrollment_id)` único.

`score` nullable es deliberado: la diferencia entre "no rindió todavía" y
"rindió y sacó cero" es la diferencia entre un alumno en curso y uno
reprobado. Un default de 0 destruiría esa distinción para siempre.

## `certificate` — el certificado

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `cert_` |
| `organization_id` | text NOT NULL FK→organization | |
| `enrollment_id` | text NOT NULL UNIQUE FK→enrollment | uno por inscripción (FR-007) |
| `code` | text NOT NULL UNIQUE | código público de verificación |
| `issued_at` | timestamp NOT NULL | |
| `issued_by` | text NULL FK→user ON DELETE set null | |
| `final_score` | integer NULL | congelado al emitir |
| `attendance_pct` | integer NULL | congelado al emitir |
| `hours` | integer NULL | ver DV-005 |
| `sent_at` | timestamp NULL | correo al alumno (US5) |
| `voided_at` | timestamp NULL | |
| `void_reason` | text NULL | |
| `created_at` | timestamp NOT NULL | |

**Índices**: `code` único global; `(organization_id, enrollment_id)`.

### Por qué se congelan nota y asistencia

El certificado dice "aprobó con 8". Si esa nota se leyera en vivo de
`assessment_result`, corregir una nota seis meses después cambiaría
retroactivamente un documento ya entregado. El certificado es una foto del
momento de emisión, no una vista.

### El código

No secuencial y no adivinable (FR-010): `nanoid` de longitud suficiente, con
el alfabeto sin caracteres ambiguos para que se pueda dictar por teléfono.
Un código correlativo permite enumerar todos los certificados de la academia y
además delata cuántos alumnos hay.

`UNIQUE` global y no por organización: el código viaja en una URL pública sin
tenant.

## Extensión de `cohort`

| Columna | Tipo | Nota |
|---|---|---|
| `min_passing_score` | integer NULL | nota mínima; NULL = sin requisito de nota |

Convive con `min_attendance_pct` de la [009](../009-clases-y-asistencia/data-model.md).
Ambos nullables: un curso puede exigir solo asistencia, solo nota, las dos o
ninguna.

## Estado de aprobación (derivado, nunca persistido)

```
notaFinal   = Σ (score / max_score × weight)   sobre evaluaciones CON nota
pendiente   = existe alguna evaluación sin nota
cumpleNota  = min_passing_score IS NULL OR notaFinal >= min_passing_score
cumpleAsis  = min_attendance_pct IS NULL OR pct >= min_attendance_pct

estado = pendiente                    → "pendiente"
       | cumpleNota AND cumpleAsis    → "aprobado"
       | otro                         → "no aprobado" + cuál criterio falló
```

Derivado y no persistido por el mismo motivo que los estados de cuota en la
[008](../008-cobranza/data-model.md): persistir un estado que depende de la
fecha y de otras tablas exige un proceso que lo mantenga, y ese proceso no
existe.

La excepción es el certificado: ahí sí se congela, porque el documento salió
del sistema y ya está en manos del alumno.

## Migración

Aditiva: tres tablas nuevas y una columna nullable en `cohort`. Sin backfill
(DV-004 define si se emiten certificados retroactivos a las camadas
importadas, y eso sería una acción explícita, nunca una migración).
