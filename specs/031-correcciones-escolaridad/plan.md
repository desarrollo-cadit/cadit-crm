# Implementation Plan: Correcciones configurables y escolaridad automática

**Branch**: `031-correcciones-escolaridad` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/031-correcciones-escolaridad/spec.md`

Asume [research.md](research.md) (15 DV), [data-model.md](data-model.md) y
los contratos de [contracts/](contracts/).

## Summary

Cada evaluación gana una **plantilla** (escala aprobado/no aprobado o
numérica 1–100 con mínimo, ejercicios con puntaje máximo que suman 100,
campos de texto, "requiere aprobación"), guardada en columnas de `assessment`.

Las correcciones pasan a una tabla propia **`correction` versionada**
(`draft` → `pending` → `published`, con `superseded` para la anterior). El
cambio de fondo es una sola puerta: **`publicarCorreccion()` es lo único que
escribe el resultado oficial** (`assessment_result.passed` + el nuevo `score`)
y espeja la devolución en la entrega. Hoy corregir publica en el acto; desde
031 un borrador o una corrección pendiente no existen para el alumno, la
planilla, el legajo ni los certificados. Como `passed` sigue siendo la verdad
de aprobación (derivado de `score >= min_score`), los once lectores actuales
no cambian: la reversión de DV-001 (010) es compatible.

La aprobación usa la capacidad nueva `correcciones.aprobar` y una bandeja
`/correcciones`. Los atajos de carga rápida siguen solo donde no pueden
saltear nada (`pass_fail` sin aprobación).

El alumno lee sus correcciones publicadas desde un módulo con las reglas del
portal (solo lectura, `contactId` en toda firma, filtro `published` en el
WHERE). La **escolaridad** se arma con funciones puras sobre los resultados
oficiales y se sirve como HTML imprimible por dos puertas (staff y alumno).

## Technical Context

**Language/Version**: TypeScript 5 estricto (`strict` + `noUncheckedIndexedAccess`), Node 20

**Primary Dependencies**: Next.js 15 (App Router) + React 19, Drizzle ORM, Zod, Better Auth, Tailwind (tokens Atlas). **Sin dependencias nuevas.**

**Storage**: PostgreSQL. Migración `0054_correcciones_escolaridad.sql`: columnas de plantilla en `assessment`, `assessment_result.score`, tabla `correction` (RLS `tenant_isolation` a mano, índices únicos parciales), backfill de `correcciones.aprobar` en `direccion` y `coordinacion`.

**Testing**: Vitest (puros + guards estructurales) y sección E2E nueva `scripts/e2e/correcciones.mjs`; Playwright para el formulario del profesor, la bandeja y el portal del alumno.

**Target Platform**: contenedor Docker self-hosted (Coolify / compose + Caddy).

**Project Type**: monolito web Next.js (API + UI).

**Performance Goals**: guardar una corrección < 300 ms; escolaridad de un alumno con 10 cursadas < 1 s; bandeja con 200 pendientes < 500 ms.

**Constraints**: capacidades, no roles; tres puertas separadas (staff / profesor / alumno); ausencia = 404; un dato que no se debe ver no viaja; colores solo por tokens; sin servicios externos (PDF por impresión del navegador).

**Scale/Scope**: 1 organización, 41 cohortes, ~10 evaluaciones por cohorte, cientos de alumnos. 11 rutas nuevas, 4 modificadas; 3 pantallas nuevas (bandeja, formulario de corrección, Mi escolaridad) y 3 modificadas (planilla, portal del profesor, cursada del alumno).

## Constitution Check

*GATE: pasa antes de Phase 0. Re-evaluado después de Phase 1: sin cambios.*

| Principio | Cómo lo cumple | Estado |
|---|---|---|
| **I — Seguridad** | Ningún secreto nuevo. El comentario de devolución del aprobador (`review_comment`) y las versiones no publicadas no viajan al alumno (guard estructural). | ✅ |
| **II — Soberanía** | Sin dependencias externas: PDF por impresión del navegador. | ✅ |
| **III — Multi-tenancy** | `correction` con `organization_id NOT NULL`, RLS `tenant_isolation`, índices org-first; toda query por `scoped()`; `rls-cobertura.test.ts` cubre la tabla. | ✅ |
| **IV — Idempotencia** | Índices únicos parciales (una publicada, una en trámite); `recordResults` sigue con upsert; migración re-ejecutable. | ✅ |
| **V — Calidad verificable** | Gate técnico + tests de [quickstart.md](quickstart.md) §2. | ✅ |
| **VI — Specs antes de código** | spec → plan → tasks. | ✅ |
| **VII — Trazabilidad** | Se registra la reversión de DV-001 (010) en su spec con referencia a 031; supuestos en spec §Assumptions y DV en research. | ✅ |
| **VIII — Foco vertical** | Cursada de la academia, dominio vigente desde 009/010. | ✅ |
| **IX — Verificación en vivo** | Sección E2E `correcciones` (11 pasos, con caminos infelices) + Playwright en los tres actores. | ✅ |

## Project Structure

### Documentation (this feature)

```text
specs/031-correcciones-escolaridad/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api-correcciones.md
│   └── escolaridad.md
├── checklists/requirements.md
└── tasks.md            # /speckit-tasks
```

### Source Code

```text
drizzle/0054_correcciones_escolaridad.sql            # nueva
src/lib/db/schema.ts                                 # assessment, assessment_result, correction
src/lib/ids.ts (o donde viva newId)                  # prefijo cor_
src/lib/grading-template.ts                          # NUEVO, puro (DV-007)
src/lib/escolaridad.ts                               # NUEVO, puro: armado + HTML (DV-011)
src/lib/capabilities.ts                              # correcciones.aprobar
src/lib/guia.ts                                      # GUIA_CAPACIDADES + grupo
src/server/corrections.ts                            # NUEVO: guardar, enviar, aprobar, devolver, publicarCorreccion, lecturas
src/server/transcript.ts                             # NUEVO: lecturas de la escolaridad
src/server/grading.ts                                # recordResults(score), planAssessmentCopy(plantilla), cohortGrading(scores+template), plantilla
src/server/submissions.ts                            # corregirEntrega → publicarCorreccion; atajo restringido
src/server/teacher-portal.ts                         # teacherRecordResult restringido
src/app/api/assessments/[id]/template/route.ts                       # NUEVA
src/app/api/assessments/[id]/corrections/[enrollmentId]/route.ts     # NUEVA (staff)
src/app/api/portal/assessments/[id]/corrections/[enrollmentId]/route.ts  # NUEVA (profesor)
src/app/api/corrections/route.ts                                     # NUEVA (bandeja)
src/app/api/corrections/[id]/route.ts                                # NUEVA
src/app/api/corrections/[id]/approve/route.ts                        # NUEVA
src/app/api/corrections/[id]/return/route.ts                         # NUEVA
src/app/api/portal/me/correcciones/route.ts                          # NUEVA (alumno)
src/app/api/contacts/[id]/escolaridad/print/route.ts                 # NUEVA (staff)
src/app/api/portal/me/escolaridad/print/route.ts                     # NUEVA (alumno)
src/app/api/assessments/[id]/results/route.ts                        # 422 usar_correccion
src/app/api/portal/assessments/[id]/results/route.ts                 # ídem
src/app/api/portal/entregas/[id]/route.ts                            # delega en publicarCorreccion
src/app/(app)/correcciones/page.tsx                                  # NUEVA bandeja
src/components/grading/correction-form.tsx                           # NUEVO, presentacional (DV-013)
src/components/grading/template-editor.tsx                           # NUEVO
src/components/grading/correction-inbox.tsx                          # NUEVO
src/components/cohorts/grading-client.tsx                            # plantilla, nota, abrir corrección
src/components/portal/portal-submissions.tsx                         # usa CorrectionForm
src/components/portal/student-submissions.tsx                        # muestra corrección publicada
src/components/portal/student-dashboard.tsx (o cursada)              # tarjeta "Mi escolaridad"
src/components/contacts/student-record-client.tsx                    # enlace "Escolaridad"
src/components/settings/roles-client.tsx                             # etiqueta + grupo
navegación del staff                                                 # entrada "Correcciones" por capacidad
scripts/e2e/correcciones.mjs + registro en scripts/e2e-selftest.mjs  # NUEVA sección
tests/unit/{grading-template,correcciones,correcciones-guard,escolaridad}.test.ts
specs/010-evaluacion-y-certificados/spec.md                          # nota de reversión de DV-001
```

**Structure Decision**: monolito existente. Lógica pura en `src/lib`, acceso a
datos en `src/server`, una ruta por puerta en `src/app/api`, UI presentacional
compartida en `src/components/grading`.

## Phasing (para tasks)

1. **Base**: migración 0054 + schema + `grading-template.ts` (TDD) + capacidad.
2. **US1 Plantilla**: ruta `template`, editor en la planilla, congelamiento, copia.
3. **US2 Corregir**: `corrections.ts` (guardar/publicar) + rutas staff y profesor + `CorrectionForm`; atajos restringidos; `corregirEntrega` delega.
4. **US3 Alumno**: lectura publicada + ruta + UI en la cursada + guard.
5. **US4 Aprobación**: enviar/aprobar/devolver + bandeja + navegación.
6. **US5 Escolaridad**: armado puro + HTML + dos rutas + enlaces.
7. **Cierre**: E2E `correcciones`, Playwright en los tres actores, nota en spec 010, CLAUDE.md (mapa de código).

## Complexity Tracking

Sin violaciones de la constitución.
