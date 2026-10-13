# Data Model — 031

Migración **`drizzle/0054_correcciones_escolaridad.sql`**, re-ejecutable
(`if not exists`, `drop policy if exists`). RLS y backfill de capacidad a mano
(`db:generate` no los produce).

## `assessment` — columnas nuevas (plantilla)

| Columna | Tipo | Regla |
|---|---|---|
| `scale` | text NOT NULL default `'pass_fail'` | check `in ('pass_fail','numeric')`. Las existentes quedan `pass_fail` (FR-001). |
| `min_score` | integer null | Obligatoria si `scale='numeric'` (1–100); null si `pass_fail`. Check en la base. |
| `requires_approval` | boolean NOT NULL default false | FR-007. |
| `criteria` | jsonb NOT NULL default `'[]'` | `[{ id, name, maxPoints }]`. Solo con `numeric`. Si no está vacío, `Σ maxPoints = 100` (validado en `validarPlantilla`). |
| `text_fields` | jsonb NOT NULL default `'[]'` | `[{ id, name, required }]`. Cualquier escala. |

Congelamiento (DV-008): `scale`, `min_score` y `criteria` (ids y máximos) no
cambian si existe una corrección `published` o `superseded`.

## `assessment_result` — columna nueva

| Columna | Tipo | Regla |
|---|---|---|
| `score` | integer null | 1–100. Solo la escribe `publicarCorreccion()`. Null en `pass_fail`. |

`passed` no cambia de semántica: NULL pendiente, true/false. En `numeric` se
deriva `score >= min_score`.

## `correction` — tabla nueva (RLS `tenant_isolation`)

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text PK | prefijo `cor_` |
| `organization_id` | text NOT NULL → organization (cascade) | |
| `assessment_id` | text NOT NULL → assessment (cascade) | |
| `enrollment_id` | text NOT NULL → enrollment (cascade) | |
| `submission_id` | text null → submission (set null) | FR-014: puede no haber entrega |
| `status` | text NOT NULL | `draft` · `pending` · `published` · `superseded` |
| `score` | integer null | nota final (suma o directa) |
| `passed` | boolean null | derivado en numérica; elegido en `pass_fail` |
| `feedback` | text null | devolución general, visible al alumno al publicarse |
| `criterion_scores` | jsonb NOT NULL default `'[]'` | `[{ criterionId, points, comment }]` |
| `text_values` | jsonb NOT NULL default `'[]'` | `[{ fieldId, value }]` |
| `corrected_by` | text → user (set null) | último que editó la versión |
| `submitted_by` / `submitted_at` | text → user / timestamp | envío a aprobación |
| `reviewed_by` / `reviewed_at` | text → user / timestamp | aprobación o devolución |
| `review_comment` | text null | comentario de devolución (FR-019), solo staff/corrector |
| `published_by` / `published_at` | text → user / timestamp | |
| `created_at` / `updated_at` | timestamp NOT NULL default now() | |

Índices:
- `correction_vigente_uq` UNIQUE `(assessment_id, enrollment_id)` WHERE `status = 'published'`
- `correction_en_tramite_uq` UNIQUE `(assessment_id, enrollment_id)` WHERE `status in ('draft','pending')`
- `correction_org_status_idx` `(organization_id, status)` — bandeja de pendientes
- `correction_org_enrollment_idx` `(organization_id, enrollment_id)` — portal y escolaridad

### Transiciones

```
(nada) ──guardar──▶ draft ──enviar──▶ pending ──aprobar──▶ published
                     ▲  │                │
                     │  └──publicar─────────────────────▶ published   (sin requires_approval, o con correcciones.aprobar)
                     └────────devolver──┘ (review_comment obligatorio)

published (vieja) ──al publicarse una nueva──▶ superseded
```

- Editar una corrección publicada = crear/actualizar la versión `draft` en
  trámite; la `published` sigue vigente (FR-021).
- `pending` no se edita: o se aprueba o se devuelve.
- Publicar (directo o por aprobación) ejecuta DV-003 en una transacción.

## Capacidad

`correcciones.aprobar` — backfill en roles `direccion` y `coordinacion` de las
organizaciones existentes (patrón de 0052).

## Escolaridad (derivada, sin tabla)

```
Escolaridad {
  alumno: { nombre, documento | null }
  academia: { nombre }
  emitidaEl: fecha
  cursadas: [{
    curso, cohorte, desde, hasta | null,
    estado: aprobado | reprobado | pendiente | sin_datos,
    asistenciaPct | null,
    evaluaciones: [{ nombre, obligatoria, escala, nota | null, aprobada | null }],
    modulos?: [ misma forma, para especializaciones (028) ]
  }]
}
```

Una evaluación sin resultado oficial se muestra "Pendiente" (FR-025/FR-027).
