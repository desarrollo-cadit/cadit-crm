# Data Model — Clases y asistencia

## `class_session` — la clase

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `cls_` |
| `organization_id` | text NOT NULL FK→organization | constitución III |
| `cohort_id` | text NOT NULL FK→cohort ON DELETE cascade | |
| `date` | timestamp NOT NULL | día de la clase |
| `start_time` / `end_time` | text NULL | "HH:MM"; hereda de la cohorte al generar |
| `teacher_id` | text NULL FK→teacher ON DELETE set null | quien la DICTÓ; puede diferir del titular (suplencia) |
| `status` | text NOT NULL | `programada` \| `dictada` \| `cancelada` |
| `topic` | text NULL | tema del día |
| `cancel_reason` | text NULL | obligatorio si `status = cancelada` |
| `rescheduled_to_id` | text NULL FK→class_session | la clase que la reemplaza |
| `notes` | text NULL | |
| `created_at` / `updated_at` | timestamp NOT NULL | |

**Índices**: `(organization_id, cohort_id, date)`;
`(organization_id, teacher_id, date)` para la liquidación por período.

La clase cancelada se conserva con su motivo: "no hubo clase el 12 porque el
profe se enfermó" es información que la coordinación necesita seis meses
después, y borrarla la destruye.

## `attendance` — la asistencia

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `att_` |
| `organization_id` | text NOT NULL FK→organization | |
| `session_id` | text NOT NULL FK→class_session ON DELETE cascade | |
| `enrollment_id` | text NOT NULL FK→enrollment ON DELETE cascade | |
| `status` | text NOT NULL | `presente` \| `ausente` \| `tarde` \| `justificada` |
| `notes` | text NULL | |
| `recorded_by` | text NULL FK→user ON DELETE set null | |
| `recorded_at` | timestamp NOT NULL | |
| `updated_at` | timestamp NOT NULL | |

**Índices**: `(session_id, enrollment_id)` único — un alumno tiene un solo
estado por clase; `(organization_id, enrollment_id)` para el porcentaje por
alumno.

## Por qué se ata a `enrollment` y no a `contact`

La asistencia es de la INSCRIPCIÓN, no de la persona. El mismo contacto puede
cursar Revit en marzo y AutoCAD en agosto; su asistencia a una no dice nada de
la otra. Atarlo al contacto obligaría a filtrar por cohorte en cada consulta y
haría imposible el índice directo.

## Cálculo del porcentaje (derivado, nunca persistido)

```
elegibles = clases de la cohorte donde
              status != 'cancelada'
              AND date >= fecha de inscripción del alumno
presentes = asistencias del alumno en esas clases con status IN (presente, tarde?)
porcentaje = presentes / elegibles
```

Dos reglas que el denominador tiene que respetar, y que son la razón de que
esto no sea un simple `count`:

- **Las clases canceladas no cuentan** (FR-004). Si no, cancelar una clase
  baja la asistencia de todo el mundo.
- **Las clases anteriores a la inscripción no cuentan** (FR-004). Un alumno
  que entra en la cuarta semana no arranca con tres semanas de ausencias.

Si `tarde` suma como presente lo define DV-002.

## Extensión de `cohort`

| Columna | Tipo | Nota |
|---|---|---|
| `min_attendance_pct` | integer NULL | mínimo para aprobar por presencia; NULL = sin requisito (DV-001) |

Vive en la cohorte y no en el curso porque una edición in-company puede pactar
un requisito distinto al de la edición abierta del mismo curso.

## Migración

Aditiva: dos tablas nuevas y una columna nullable en `cohort`. Sin backfill —
no se inventan clases pasadas para las 41 cohortes ya importadas. Quien quiera
el cronograma de una cohorte vieja lo genera con la acción explícita.
