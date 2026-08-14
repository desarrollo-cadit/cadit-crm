# Tasks: Modelo académico + CRM de ventas — cursos, cohortes e inscripciones (Fase 1)

**Input**: Design documents from `/specs/004-modelo-academico/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/pipeline-board.md, quickstart.md

**Tests**: Se incluyen tests unitarios acotados a las reglas de negocio nuevas
(constraints de unicidad, comportamiento de `onLeadActivity`) — no hay self-test E2E
de UI en esta fase (Principio IX no aplica todavía, no hay pantallas nuevas).

**Organization**: Tareas agrupadas por user story de `spec.md` para poder
implementarse y validarse de forma independiente.

## Phase 1: Setup

- [X] T001 Agregar prefijos de ID nuevos en `src/lib/db/ids.ts`: `course: "crs"`,
      `cohort: "coh"`, `enrollment: "enr"` (reemplaza `lead: "ld"`), `license: "lic"`,
      `automationRule: "arule"` (research.md DV-008)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: ninguna user story puede empezar hasta terminar esta fase.

- [X] T002 Editar `src/lib/db/schema.ts` por completo per `data-model.md`: renombrar
      `lead`→`enrollment` (agregar `cohort_id` NULLABLE FK a `cohort`, `enrolled_at`,
      reemplazar `lead_contact_uq` por los dos índices únicos parciales
      `enrollment_contact_cohort_uq` y `enrollment_contact_general_uq`), agregar
      tablas `course`, `cohort`, `license`, `automation_rule`, agregar columnas
      `source`/`utm_campaign` a `contact`
- [X] T003 Generar la migración con `pnpm db:generate` (confirmar el rename
      `lead`→`enrollment` cuando lo pregunte, research.md DV-004); revisar el SQL
      generado en `drizzle/` y confirmar que los índices parciales quedaron con la
      cláusula `WHERE` correcta (ajustar a mano si `drizzle-kit` no la generó bien)
- [X] T004 Sembrar las 7 etapas académicas (lead, contactado, inscripto,
      con_licencia, cursando, finalizado, abandonó) como `pipeline_stage` por
      organización en `scripts/seed/demo.ts` (o un helper de seed compartido),
      research.md DV-001
- [X] T005 [P] Test unitario (ajustado: verificación de forma del schema, sin
      DB de test — ver nota al pie) de los dos índices únicos parciales de `enrollment` en
      `tests/unit/enrollment-constraints.test.ts`: dos filas con mismo
      `(contact_id, cohort_id)` fallan; dos filas sin cohorte para el mismo contacto
      fallan; combinaciones válidas (misma persona, cohortes distintas, o una general
      + una con cohorte) insertan sin error

**Checkpoint**: schema y migración listos — las user stories pueden empezar.

---

## Phase 3: User Story 1 - Gestionar leads generales de ventas de la academia (Priority: P1) 🎯 MVP

**Goal**: que `onLeadActivity` y el tablero general sigan funcionando exactamente
como hoy, ahora sobre `enrollment` con `cohort_id NULL`.

**Independent Test**: contacto nuevo escribe por WhatsApp (o seed) → aparece en
`GET /api/pipeline/board` sin `cohortId`.

- [X] T006 [US1] Actualizar `src/server/inbox/lead-activity.ts`
      (`onLeadActivity`): cambiar `schema.lead`→`schema.enrollment` y el target de
      `onConflictDoNothing` al índice parcial `enrollment_contact_general_uq`
      (`contact_id` con `cohort_id IS NULL`) — sin cambiar ninguna otra lógica
      (research.md DV-005)
- [X] T007 [US1] Actualizar `src/app/api/pipeline/board/route.ts`: usar
      `schema.enrollment`; sin `cohortId` filtrar `cohort_id IS NULL` (tablero
      general); con `cohortId` filtrar por esa cohorte; renombrar el campo de
      respuesta `leads`→`enrollments` (contracts/pipeline-board.md)
- [X] T008 [US1] Actualizar `src/app/api/pipeline/leads/[id]/route.ts`: operar sobre
      `schema.enrollment`; aceptar `cohortId` opcional (`string | null`) en el body
      del `PATCH` para asignar/reasignar cohorte sin crear fila nueva
      (contracts/pipeline-board.md, FR-008)
- [X] T009 [US1] Actualizar `src/components/pipeline/pipeline-client.tsx`: tipo
      `BoardLead`→`BoardEnrollment` (agregar `cohortId`), el fetch/estado pasa a leer
      el campo `enrollments` de la respuesta — sin cambios visuales
- [X] T010 Actualizar `src/server/ai/pipeline.ts` (`moveLeadToStage`) y
      `src/server/contacts.ts` (`getContactStage`) para operar sobre
      `schema.enrollment` filtrando explícitamente `cohort_id IS NULL` (el lead
      general) por `contactId` — el agente de IA y el panel de contacto operan desde
      la conversación de WhatsApp, no desde una cohorte concreta. **Ampliado durante
      la implementación** (no estaban mapeados en el plan original): también
      `src/app/api/bot/reset/route.ts` (reinicio del lead general al resetear una
      conversación de prueba) y `src/app/api/pipeline/stages/[id]/route.ts`
      (reasignación de tarjetas al borrar una etapa) seguían referenciando
      `schema.lead` directamente y rompían el build — mismo tipo de fix, sin lógica
      nueva. `appendLeadNote` no tocaba `schema.lead`, sin cambios.
- [X] T011 [P] [US1] Test unitario en `tests/unit/lead-activity.test.ts` (mock de
      `@/lib/db` igual que `lab-sandbox.test.ts`): sin lead general existente inserta
      un `enrollment` con `cohortId: null` en la primera etapa abierta con conflict
      target; con lead general existente, solo actualiza `last_activity_at`

**Checkpoint**: el CRM de ventas general funciona igual que hoy, ahora sobre
`enrollment`.

---

## Phase 4: User Story 2 - Planificar una cohorte y verla como tablero propio (Priority: P1)

**Goal**: poder crear curso + cohorte y consultar su tablero vacío filtrado.

**Independent Test**: crear curso+cohorte por script, `GET
/api/pipeline/board?cohortId=...` devuelve etapas sin inscripciones.

- [X] T012 [US2] Crear `src/server/courses.ts` con `createCourse`/`createCohort`
      (scoped por organización) + `tests/unit/courses.test.ts`
- [X] T013 [US2] **Ajustado durante la implementación**: `scripts/seed/demo.ts` NO
      es un seed genérico — es la demo fija "Ferretería El Martillo" (negocio de
      ejemplo del CRM original), no el lugar para datos académicos. Se creó un seed
      independiente (`src/server/seed/academic.ts` + `scripts/seed/academic.ts` +
      script `pnpm seed:academic`) que siembra 2 cursos y 3 cohortes usando los
      helpers de T012

**Checkpoint**: se puede planificar una cohorte y ver su tablero (vacío) filtrado.

---

## Phase 5: User Story 3 - Un contacto se inscribe en más de una cohorte sin conflicto (Priority: P1)

**Goal**: demostrar la relación N:N central de la fase — un contacto con su lead
general y/o inscripciones en cohortes distintas, sin conflicto.

**Independent Test**: seed con el mismo contacto en dos cohortes distintas inserta sin
error; el mismo par `(contacto, cohorte)` repetido falla.

- [X] T014 [US3] El mismo `src/server/seed/academic.ts` (T013) siembra el contacto
      "Diego Fernández" con lead general + inscripción a la cohorte A de Revit, y el
      contacto "Renata Ibarra" inscripto en DOS cohortes distintas (Revit cohorte B +
      Civil 3D) sin lead general — demuestra la coexistencia de FR-004/FR-005
- [X] T015 [P] [US3] Sin DB de test para round-trip de constraints (ver nota de
      T005). La invariante ("un `contact_id` puede repetirse en `cohort_id`
      distintos, pero no en el mismo par") queda probada estructuralmente por
      `tests/unit/enrollment-constraints.test.ts` (T005: el índice único parcial
      solo cubre `(contact_id, cohort_id)`, nunca `contact_id` solo cuando hay
      cohorte) + verificación en vivo real contra Postgres en quickstart.md paso 4

**Checkpoint**: un contacto puede tener lead general + N inscripciones a cohortes,
todas independientes.

---

## Phase 6: User Story 4 - Mover una inscripción de etapa reutilizando el kanban existente (Priority: P2)

**Goal**: confirmar que el drag & drop existente sigue funcionando sin cambios de UI,
tanto en el tablero general como en el de una cohorte.

**Independent Test**: mover una tarjeta en `/pipeline` (con o sin filtro de cohorte) y
confirmar que persiste solo esa inscripción.

- [X] T016 [US4] Revisado `src/components/pipeline/pipeline-client.tsx`
      (`onDragEnd`): sigue llamando a `PATCH /api/pipeline/leads/[id]` con
      `{ stageId, position }` sin cambios — compatible con el nuevo `patchSchema`
      (campos ahora opcionales, sin romper el body existente)
- [X] T017 [US4] Verificado en vivo contra Postgres real (docker-compose.dev.yml,
      puerto 5433 — el 5432 estaba tomado por un Postgres nativo de Windows en esta
      máquina): `pnpm db:migrate` + `pnpm seed:academic` + `PATCH
      /api/pipeline/leads/[id]` moviendo etapa (equivalente al drag & drop) y
      asignando `cohortId` — la tarjeta persiste el cambio de etapa y desaparece del
      tablero general al asignarle cohorte, apareciendo filtrada en
      `/api/pipeline/board?cohortId=...`. La constraint `enrollment_contact_cohort_uq`
      frenó correctamente un intento de duplicar `(contact_id, cohort_id)` (FR-004)

**Checkpoint**: mover etapas funciona igual que hoy en ambos contextos.

---

## Phase 7: User Story 5 - Registrar el origen de un contacto (Priority: P3)

**Goal**: que `source`/`utm_campaign` persistan y sean legibles, sin UI todavía.

**Independent Test**: crear contacto con `source` vía seed y confirmar que persiste.

- [X] T018 [P] [US5] `serializeContact` en `src/server/contacts.ts` expone
      `source`/`utmCampaign` (agregados en T002); `ContactDto` en `src/lib/types.ts`
      actualizado en consecuencia
- [X] T019 [P] [US5] El seed académico (T013) ya crea "Diego Fernández" con
      `source: "feria-2026"` / `utmCampaign: "feria_capacitaciones_agosto"` y
      "Valentina Rojas" con `source: "whatsapp"`

**Checkpoint**: el dato de origen persiste, listo para que Fase 5 lo use.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T020 [P] Gate técnico completo en verde: `pnpm typecheck` (0 errores),
      `pnpm lint` (0 errores), `pnpm build` (compila, 56 rutas), `pnpm test` (24
      archivos, 123 tests, todos en verde)
- [X] T021 Verificado en vivo: `pnpm db:migrate` aplicó la migración contra Postgres
      real, `pnpm seed:academic` sembró 2 cursos/3 cohortes/5 inscripciones, y
      `/api/pipeline/board` (con y sin filtro de cohorte) + `PATCH
      /api/pipeline/leads/[id]` confirmaron el comportamiento de `quickstart.md`
      paso 6 (ver detalle en T017)
- [X] T022 `Status` de `specs/004-modelo-academico/spec.md` actualizado a
      `Implemented` tras T021

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: sin dependencias.
- **Foundational (T002-T005)**: depende de T001 (prefijos de ID usados en el schema)
  — BLOQUEA todas las user stories.
- **User Stories (Phase 3-7)**: todas dependen de Foundational. US1 (T006-T011) y US2
  (T012-T013) pueden avanzar en paralelo (archivos distintos). US3 (T014-T015)
  depende de que T006 y T013 ya existan (usa el lead general Y una cohorte sembrada).
  US4 (T016-T017) depende de T007-T009 (contrato del board/patch ya migrado). US5
  (T018-T019) es independiente del resto salvo T002.
- **Polish (T020-T022)**: depende de que todas las stories elegidas estén completas.

### Notas de paralelismo

- T002 (schema.ts) y T003 (migración) NO son paralelas entre sí (T003 depende del
  contenido final de T002), ni con ninguna otra tarea que edite `schema.ts`.
- `scripts/seed/demo.ts` se edita en T004, T013, T014 y T019 — son ediciones
  secuenciales del mismo archivo, no paralelas entre sí, pero cada una solo depende
  de la anterior dentro de su propia fase.
- T005, T011, T015 (tests unitarios, archivos nuevos distintos) sí son paralelas
  entre sí una vez completada la fase Foundational correspondiente.
- T018/T019 (US5) son paralelas entre sí y con el resto de las stories salvo T002.

---

## Implementation Strategy

### MVP First (User Story 1 únicamente)

1. Completar Phase 1 (Setup) y Phase 2 (Foundational).
2. Completar Phase 3 (US1) — el CRM de ventas general sigue andando igual que hoy,
   ahora sobre `enrollment`.
3. **Parar y validar**: correr `quickstart.md` pasos 1, 2 (parcial) y 5 (WhatsApp).
4. Recién ahí sumar US2/US3 (gestión académica por cohorte) y US4/US5.

### Entrega incremental

1. Setup + Foundational → base lista.
2. US1 → el CRM de ventas no se rompe (riesgo más alto de la fase, va primero).
3. US2 → se puede planificar una cohorte.
4. US3 → un contacto puede tener varias inscripciones sin conflicto (el requisito
   central del pivot original).
5. US4 → confirma que la UI existente no tiene regresiones.
6. US5 → deja el campo de origen listo para Fase 5.
7. Polish → gate técnico + verificación en vivo del quickstart.
