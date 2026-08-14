# Implementation Plan: Gestión académica operativa (Fase 2)

**Branch**: `005-gestion-academica-operativa` | **Date**: 2026-08-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-gestion-academica-operativa/spec.md`

## Summary

Reemplazar las dos planillas de Excel (ventas/coordinación y soporte) que hoy
gestionan la operación académica, construyendo sobre el modelo de la Fase 1
(`course`, `cohort`, `enrollment`, `license`). Se agregan tres catálogos nuevos
(`software` con inventario de licencias, `teacher`, `company`), se enriquece
`cohort` (costo, horario, aula, temario, software usado, profesor como FK) y
`enrollment` (datos comerciales + checklist de onboarding de soporte), se agrega
un segundo rol funcional (`soporte`, sin acceso a datos financieros) sobre el
sistema de roles ya existente de Better Auth, y se expone un endpoint público de
solo lectura para el catálogo de cursos. Sin importación de las planillas
existentes (carga manual desde cero, mismo criterio que la Fase 1).

## Technical Context

**Language/Version**: TypeScript estricto (`strict` + `noUncheckedIndexedAccess`), Node 22

**Primary Dependencies**: Next.js 15 (App Router) + React 19 · Drizzle ORM ·
Better Auth (plugin organization existente — se reutiliza `member.role`, texto
libre, sin cambios de esquema) · Zod · nanoid vía `newId()` (prefijos nuevos)

**Storage**: PostgreSQL — migración nueva en `drizzle/`, generada con
`drizzle-kit generate`

**Testing**: Vitest (unit) para: constraints únicos nuevos (email/celular de
contacto), helper de disponibilidad de licencias, helper de choque de horario, y
el DTO de roster que oculta campos financieros para `role === "soporte"`. Sin
self-test E2E de UI en esta fase de planificación — las pantallas nuevas
(roster, calendario, dashboard) activan el Principio IX cuando se implementen
(Fase 3+ de este mismo change, ver tasks.md)

**Target Platform**: mismo entorno que el resto del repo (Coolify / docker compose)

**Project Type**: Aplicación web monolítica existente (sin paquetes nuevos)

**Performance Goals**: sin objetivos nuevos — mismo orden de magnitud que el resto
del pipeline (decenas/cientos de filas por organización)

**Constraints**: multi-tenant real (`organization_id NOT NULL` + `scoped()` en
toda query nueva); sin nuevas dependencias externas en runtime (Constitución II);
el endpoint público NO debe exponer `contact`/`enrollment`/montos bajo ninguna
circunstancia (Constitución I — aislamiento de datos, aquí extendido a "dato
interno" aunque no sea cross-tenant)

**Scale/Scope**: 3 tablas nuevas (`software`, `teacher`, `company`) + 1 tabla
puente (`cohort_software`) + columnas nuevas en `contact`, `cohort`, `enrollment`,
`license`; ~8 endpoints nuevos o modificados; 1 rol nuevo; 4 pantallas nuevas
(roster de cohorte, calendario, dashboard financiero, gestión de catálogos) fuera
del alcance de este `plan.md` de diseño de datos — se detallan en `tasks.md`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principio | Evaluación | Estado |
|---|---|---|
| I. Seguridad de Datos | Sin secretos nuevos; el endpoint público es la única superficie sin auth — diseñado para NUNCA leer `contact`/`enrollment`/montos (DV-010); nuevo campo `cedula` es PII pero ya vive junto al resto de PII de `contact`, mismo modelo de protección | ✅ |
| II. Soberanía (endurecida) | Cero dependencias externas nuevas — todo Postgres/Drizzle, el endpoint público es servido por este mismo backend | ✅ |
| III. Multi-Tenancy Real | Todas las tablas nuevas llevan `organization_id NOT NULL` + índice org-first; el endpoint público resuelve la única organización de la instancia (DV-010) sin recibir `organizationId` del caller | ✅ |
| IV. Idempotencia | Migraciones versionadas re-ejecutables; nuevos índices únicos parciales (email/celular) evitan duplicados por reintento | ✅ |
| V. Calidad Verificable | Gate típico + Vitest para los constraints/helpers nuevos | ✅ |
| VI. Specs Antes de Código | spec.md (validado, 15/15 checklist) → este plan → tasks → implement | ✅ |
| VII. Trazabilidad | Decisiones DV-001 a DV-011 documentadas en `research.md`; assumptions del spec ya registran lo pospuesto (cuotas individuales, licencias por serial, lista de espera) | ✅ |
| VIII. Foco Vertical | Mismo punto ya justificado en `specs/004-modelo-academico/plan.md` (Complexity Tracking) — esta feature profundiza la misma reconversión ya aceptada por el dueño, no abre un dominio nuevo | ✅ heredado |
| IX. Verificación en Vivo | Aplica de lleno esta vez: hay pantallas nuevas de cara al usuario (roster, calendario, dashboard). Se verifica en la fase de implementación (`tasks.md`), no en este `plan.md` de diseño | N/A aquí |

**Post-diseño (Fase 1 de diseño)**: re-evaluado tras `data-model.md` — sin
violaciones nuevas. La ganancia de DV-002 (mapear violaciones de unicidad de
Postgres a 409 en vez de 500 genérico) es una mejora transversal que refuerza el
Principio V (no reporta éxito ni fallo genérico donde hay un caso de negocio
claro), aplicada también a rutas ya existentes de la Fase 1.

## Project Structure

### Documentation (this feature)

```text
specs/005-gestion-academica-operativa/
├── plan.md                        # Este archivo
├── research.md                    # Fase 0 — decisiones técnicas (DV-001..DV-011)
├── data-model.md                  # Fase 1 — entidades y relaciones
├── quickstart.md                  # Fase 1 — cómo probar la fase
├── contracts/
│   ├── enrollments.md             # POST /api/enrollments (alta comercial + dedup)
│   ├── cohort-roster.md           # GET /api/cohorts/:id/roster (DTO por rol)
│   └── public-courses.md          # GET /api/public/courses[/:id]
└── tasks.md                       # Fase 2 (/speckit-tasks, todavía no generado)
```

### Source Code (repository root)

```text
src/
├── lib/db/
│   ├── schema.ts        # + software, teacher, company, cohort_software;
│   │                     #   + columnas en contact/cohort/enrollment/license
│   └── ids.ts            # + prefijos: software, teacher, company
├── lib/api.ts             # + requireFullAccess() (variante de withAuth con
│                           #   chequeo de rol) + mapeo 23505 → 409 en el catch
├── server/
│   ├── courses.ts         # + listCourses, listCohorts, updateCohort
│   ├── licenses.ts        # NUEVO — pool de licencias, disponibilidad, asignar/liberar
│   ├── teachers.ts        # NUEVO — CRUD + detección de choque de horario
│   ├── companies.ts       # NUEVO — CRUD mínimo
│   ├── enrollments.ts     # NUEVO — alta comercial (contacto + inscripción),
│   │                       #   checklist de onboarding
│   ├── finance.ts         # NUEVO — total facturado por mes (dashboard)
│   └── contacts.ts        # serializeContact + email/cedula
├── app/api/
│   ├── software/route.ts          # NUEVO
│   ├── teachers/route.ts          # NUEVO
│   ├── companies/route.ts         # NUEVO
│   ├── courses/route.ts           # NUEVO (GET list; POST ya existía como server fn, falta ruta)
│   ├── cohorts/route.ts           # NUEVO (POST)
│   ├── cohorts/[id]/route.ts      # NUEVO (GET, PATCH)
│   ├── cohorts/[id]/roster/route.ts # NUEVO — DTO varía según session.role
│   ├── enrollments/route.ts       # NUEVO (POST)
│   ├── enrollments/[id]/checklist/route.ts # NUEVO (PATCH)
│   ├── dashboard/finance/route.ts # NUEVO — requireFullAccess
│   └── public/courses/route.ts    # NUEVO — sin auth
│       └── [id]/route.ts          # NUEVO — sin auth
└── components/
    ├── cohorts/roster-client.tsx  # NUEVO
    ├── calendar/calendar-client.tsx # NUEVO
    └── dashboard/finance-panel.tsx # NUEVO

drizzle/
└── 0005_<nombre>.sql      # migración generada por drizzle-kit generate
```

**Structure Decision**: se extiende el monolito existente, mismo patrón plano de
`src/server/*.ts` usado en la Fase 1 (un archivo por dominio, sin carpetas hasta
que la lógica lo justifique). Las pantallas nuevas van bajo
`src/app/(app)/<ruta>/page.tsx` siguiendo el layout ya existente
(`src/app/(app)/pipeline/page.tsx` como referencia).

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

Sin violaciones nuevas más allá de la ya heredada y justificada en
`specs/004-modelo-academico/plan.md` (Principio VIII).
