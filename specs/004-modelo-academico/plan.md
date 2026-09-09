# Implementation Plan: Modelo académico — cursos, cohortes e inscripciones (Fase 1)

**Branch**: `004-modelo-academico` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-modelo-academico/spec.md`

## Summary

Reconvertir el pipeline de ventas (`pipeline_stage` + `lead`) para que sirva DOS
funciones a la vez: CRM de ventas general de la academia (leads sin cohorte asignada —
el comportamiento de hoy, sin cambios) y gestión de inscripciones por cohorte. Se
agregan `course`, `cohort`, `license` y `automation_rule` (solo modelo), y se
renombra/extiende `lead`→`enrollment` con `cohort_id` **opcional**: NULL = lead
general, con valor = inscripción a esa cohorte. Se siembran las 7 etapas académicas
como `pipeline_stage` por organización (compartidas por ambos contextos), y el
tablero kanban existente (`PipelineClient`/`StageManager`/`/api/pipeline/board`)
filtra por `cohort_id` sin cambios de UI — sin filtro muestra el tablero general, con
`cohortId` muestra el de esa cohorte. `onLeadActivity` (auto-creación de tarjeta al
primer mensaje de WhatsApp, en `src/server/inbox/lead-activity.ts`) queda **intacto**
en su lógica: sigue creando el lead general de siempre. Arranque en limpio (sin
backfill de datos reales, confirmado en el spec — y aún menos relevante ahora que
`cohort_id` es nullable). Sin pantallas nuevas, sin importación de Excel, sin
email/WhatsApp/licencias-UI todavía.

## Technical Context

**Language/Version**: TypeScript estricto (`strict` + `noUncheckedIndexedAccess`), Node 22

**Primary Dependencies**: Next.js 15 (App Router) + React 19 · Drizzle ORM · Better
Auth (organization existente, sin cambios) · Zod (validación de los nuevos inputs) ·
nanoid vía `newId()` (prefijos nuevos en `src/lib/db/ids.ts`)

**Storage**: PostgreSQL (self-hosted, mismo cluster/DB que hoy) — migración nueva en
`drizzle/`, generada con `drizzle-kit generate` y aplicada al arrancar el contenedor
(igual que el resto del proyecto)

**Testing**: Vitest (unit) para helpers de query nuevos (p. ej. constraint de
`(contactId, cohortId)` único) + extensión del seed de demo para verificar de punta a
punta vía script, tal como pide el criterio de aceptación de la Fase 1 (no hay UI que
recorrer con Playwright en esta fase — Principio IX no aplica todavía, se activa en
Fase 3 cuando haya pantallas)

**Target Platform**: mismo entorno que el resto del repo (Coolify / docker compose)

**Project Type**: Aplicación web monolítica existente (sin paquetes nuevos)

**Performance Goals**: sin objetivos nuevos — el tablero filtrado por cohorte debe
responder en el mismo orden de magnitud que hoy responde filtrado por organización
(pocas decenas/cientos de inscripciones por cohorte)

**Constraints**: multi-tenant real (`organization_id NOT NULL` + `scoped()` en toda
query nueva); migraciones re-ejecutables e idempotentes; sin nuevas dependencias
externas en runtime (Constitución II — todo esto es solo PostgreSQL/Drizzle, no toca
Meta Cloud API ni el LLM)

**Scale/Scope**: 5 tablas nuevas o modificadas (`course`, `cohort`, `enrollment`
—ex `lead`—, `license`, `automation_rule`) + 2 columnas nuevas en `contact`; 0
pantallas nuevas; 1 endpoint existente modificado (`GET /api/pipeline/board`)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| I. Seguridad de Datos | Sin secretos ni PII nueva más allá de lo que ya vive en `contact`; sin cambios en cifrado | ✅ |
| II. Soberanía (endurecida) | Cero dependencias externas nuevas — solo Postgres/Drizzle, ya self-hosted | ✅ |
| III. Multi-Tenancy Real | Las 5 tablas nuevas/tocadas llevan `organization_id NOT NULL` + índice org-first; toda query nueva pasa por `scoped()` | ✅ |
| IV. Idempotencia | Migraciones versionadas y re-ejecutables (drizzle-kit); unique `(contact_id, cohort_id)` evita inscripciones duplicadas por reintento de seed/import (relevante para Fase 2) | ✅ |
| V. Calidad Verificable | Gate típico (`typecheck && lint && build && test`) + Vitest para el constraint nuevo | ✅ |
| VI. Specs Antes de Código | Este flujo: spec.md (aprobado) → este plan → tasks → implement | ✅ |
| VII. Trazabilidad | Decisión "Opción A" (reusar `pipeline_stage`) y "arranque en limpio" ya registradas en spec.md/Assumptions; research.md documenta el resto | ✅ |
| VIII. Foco Vertical | **Ver Complexity Tracking** — el dominio deja de ser "leads de venta de WhatsApp" y pasa a ser académico; justificado abajo | ⚠️ justificado |
| IX. Verificación en Vivo | No aplica todavía (sin UI/comportamiento observable nuevo en esta fase) — se activa en Fase 3 | N/A |

**Post-diseño (Fase 1 de diseño)**: re-evaluado tras `data-model.md` — sin violaciones
nuevas; el único punto marcado (VIII) queda documentado en Complexity Tracking, no
bloquea porque es una decisión de producto ya tomada por el dueño (reconversión
completa de esta instancia).

## Project Structure

### Documentation (this feature)

```text
specs/004-modelo-academico/
├── plan.md              # Este archivo
├── research.md          # Fase 0 — decisiones técnicas
├── data-model.md         # Fase 1 — entidades y relaciones
├── quickstart.md         # Fase 1 — cómo probar la fase (seed + Drizzle Studio)
├── contracts/
│   └── pipeline-board.md # Fase 1 — contrato modificado del board
└── tasks.md              # Fase 2 (/speckit-tasks, todavía no generado)
```

### Source Code (repository root)

```text
src/
├── lib/db/
│   ├── schema.ts          # + course, cohort, license, automationRule; lead → enrollment
│   ├── ids.ts              # + prefijos: course, cohort, enrollment, license, automationRule
│   └── tenant.ts           # sin cambios (scoped() se reusa tal cual)
├── server/
│   ├── contacts.ts         # getContactStage → deja de asumir "1 lead por contacto"
│   ├── courses.ts          # NUEVO — CRUD mínimo de course/cohort para el seed/Fase 3
│   ├── enrollments.ts      # NUEVO — reemplaza la lógica de lead que hoy vive dispersa
│   ├── inbox/lead-activity.ts # SIN CAMBIOS de lógica — solo target de tabla/conflicto (DV-005)
│   └── ai/pipeline.ts       # moveLeadToStage/appendLeadNote → ajustar a N enrollments
├── app/api/pipeline/
│   ├── board/route.ts      # + query param cohortId (sin filtro = tablero general)
│   ├── leads/[id]/route.ts  # + campo cohortId en el PATCH (asignar/reasignar cohorte)
│   └── stages/route.ts      # sin cambios de contrato
└── components/pipeline/
    ├── pipeline-client.tsx # + prop/paso de cohortId al fetch (sin rediseño)
    └── stage-manager.tsx    # sin cambios

drizzle/
└── 0003_<nombre>.sql        # migración generada por drizzle-kit generate

scripts/seed/
└── demo.ts                  # + curso/cohorte/inscripción de ejemplo (Criterio de aceptación)
```

**Structure Decision**: se extiende el monolito existente, sin paquetes nuevos.
Los nombres de archivo de `src/server/` siguen el patrón plano ya usado
(`contacts.ts`, no `contacts/index.ts`) salvo que la lógica crezca lo suficiente
para justificar una carpeta (no es el caso en esta fase).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Principio VIII (Foco Vertical: "CRM de conversaciones y leads de WhatsApp") | El dueño del repo decidió reconvertir esta instancia a gestor académico, reusando la infraestructura (auth, WhatsApp, deploy) pero reemplazando el dominio de negocio — decisión de producto explícita, no una desviación accidental | Mantener el dominio de "leads de venta genéricos" no sirve al caso de uso real de esta instancia (capacitaciones); bifurcar el repo en vez de reconvertirlo perdería toda la infraestructura ya construida y probada (auth, mensajería, deploy) sin necesidad, ya que el canal WhatsApp y el pipeline siguen siendo el mecanismo correcto para este dominio |
