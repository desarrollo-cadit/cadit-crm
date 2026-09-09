# Tasks: Gestión académica operativa (Fase 2)

**Input**: Design documents from `/specs/005-gestion-academica-operativa/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: Strict TDD activo en este proyecto — se incluyen tests unitarios
acotados a las reglas de negocio nuevas (dedup de contacto, pool de licencias,
choque de horario, DTO de roster por rol). Esta vez SÍ aplica el self-test de
comportamiento en vivo del Principio IX (hay pantallas nuevas) — ver T048.

**Organization**: Tareas agrupadas por user story de `spec.md`, en el mismo
orden de prioridad (P1 → P2 → P3), para poder implementarse y validarse de
forma independiente igual que en `specs/004-modelo-academico/tasks.md`.

## Phase 1: Setup

- [X] T001 Agregar prefijos de ID nuevos en `src/lib/db/ids.ts`: `software:
      "sw"`, `teacher: "tch"`, `company: "cia"` (research.md DV-011)

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: ninguna user story puede empezar hasta terminar esta fase.

- [X] T002 Editar `src/lib/db/schema.ts` por completo per `data-model.md`:
      agregar tablas `software`, `teacher`, `company`, `cohort_software`
      (puente N:N); en `cohort` reemplazar `professor` (texto) por `teacher_id`
      (FK nullable) y agregar `cost`, `frequency`, `classroom`,
      `syllabus_url`; en `enrollment` agregar `amount`, `installments`,
      `payment_notes`, `national_id`, `invoice_number`, `receipt_number`,
      `seller_id`, `company_id`, `terms_email_sent_at`,
      `software_installed_at`, `had_own_license`,
      `academia_online_access_at`; en `license` agregar `software_id` (FK NOT
      NULL); en `contact` agregar `email` y `national_id` + los índices únicos
      parciales `contact_org_email_uq` y `contact_org_phone_uq`
- [X] T003 Generar la migración con `pnpm db:generate` (confirmar el drop de
      `cohort.professor` — reemplazo por `teacher_id`, DV-005, sin backfill);
      revisar el SQL generado en `drizzle/` y confirmar que los índices únicos
      parciales de `contact` quedaron con la cláusula `WHERE` correcta
- [X] T004 [P] En `src/lib/api.ts`: agregar `requireFullAccess()` (variante de
      `withAuth` que además exige `session.role !== "soporte"`, 403 si no
      cumple — DV-001) y mapear en el catch de `withAuth` los errores Postgres
      con `code === "23505"` a `apiError(409, "duplicate", ...)` en vez del 500
      genérico actual (DV-002)
- [X] T005 [P] Test unitario en `tests/unit/api.test.ts` (nuevo): un handler
      que lanza un error con `code: "23505"` responde 409 `duplicate`;
      `requireFullAccess` responde 403 para `role: "soporte"` y deja pasar
      cualquier otro rol

**Checkpoint**: schema, migración y helpers de auth listos — las user stories
pueden empezar.

---

## Phase 3: User Story 1 - Planificar una cohorte con toda la información operativa (Priority: P1) 🎯 MVP

**Goal**: coordinación crea/edita una cohorte con costo, horario, aula, temario,
software y profesor, sin volver a la planilla.

**Independent Test**: crear curso + cohorte indicando todos los campos vía API;
`GET` esa cohorte y confirmar que todos quedaron guardados.

- [X] T006 [US1] Crear `src/server/teachers.ts`: `createTeacher`,
      `listTeachers` (scoped por organización)
- [X] T007 [US1] Crear `src/server/software.ts`: `createSoftware`,
      `listSoftware` — catálogo básico (`name`, `totalLicenses`), sin lógica de
      disponibilidad todavía (eso es US4)
- [X] T008 [US1] Ampliar `src/server/courses.ts`: `createCohort` acepta
      `teacherId`, `cost`, `frequency`, `classroom`, `syllabusUrl`,
      `softwareIds` (inserta filas en `cohort_software`); agregar
      `listCourses`, `listCohorts`, `getCohort` (con `teacher`/`software`
      resueltos), `updateCohort`
- [X] T009 [US1] `src/app/api/teachers/route.ts` (`GET`, `POST`)
- [X] T010 [US1] `src/app/api/software/route.ts` (`GET`, `POST` — catálogo
      básico; el `PATCH` de `totalLicenses` con validación de stock es T032,
      US4)
- [X] T011 [US1] `src/app/api/courses/route.ts` (`GET` list, `POST` — la
      función server ya existía de la Fase 1, faltaba la ruta)
- [X] T012 [US1] `src/app/api/cohorts/route.ts` (`POST`) y
      `src/app/api/cohorts/[id]/route.ts` (`GET`, `PATCH`)
- [X] T013 [P] [US1] Test unitario en `tests/unit/courses.test.ts` (extender el
      existente de la Fase 1): `createCohort`/`updateCohort` con los campos
      nuevos, `listCohorts` incluye `teacher`/`software` resueltos
- [X] T014 [US1] Pantalla de gestión académica para coordinación:
      `src/components/academic/cohort-form.tsx` +
      `src/app/(app)/academico/page.tsx` — listar/crear/editar cursos y
      cohortes (costo, horario, aula, temario, software, profesor)

**Checkpoint**: coordinación puede planificar una cohorte completa sin Excel.

---

## Phase 4: User Story 2 - Inscribir un alumno con sus datos comerciales, sin duplicar contactos (Priority: P1)

**Goal**: ventas inscribe con monto, cuotas, cédula, factura, recibo, vendedor y
empresa opcional; el sistema impide duplicar email/celular.

**Independent Test**: `POST /api/enrollments` con contacto nuevo + datos
comerciales → 201; repetir con el mismo email o celular de otro contacto → 409
con mensaje explícito.

- [X] T015 [US2] Crear `src/server/companies.ts`: `createCompany`,
      `listCompanies`
- [X] T016 [US2] `src/app/api/companies/route.ts` (`GET`, `POST`)
- [X] T017 [US2] Ampliar `src/server/contacts.ts` / `src/app/api/contacts/route.ts`
      (`POST` existente de la Fase 1): aceptar `email` y `nationalId`
      opcionales en el body; la unicidad la resuelven los índices de T002 +
      el mapeo 409 de T004 (DV-003)
- [X] T018 [US2] Crear `src/server/enrollments.ts`: `createEnrollment` —
      contacto existente (`contactId`) o inline (`contact: {...}`), valida
      `sellerId` como miembro de la organización, campos comerciales
      (`contracts/enrollments.md`)
- [X] T019 [US2] `src/app/api/enrollments/route.ts` (`POST`) — implementa
      `contracts/enrollments.md` (409 en duplicado de contacto, 422 en
      `sellerId` inválido)
- [X] T020 [P] [US2] Test unitario en `tests/unit/enrollments.test.ts` (nuevo):
      alta con contacto inline, alta con `contactId` existente, dedup de
      email/celular → 409, `companyId` asociado sin tocar datos personales,
      `sellerId` no-miembro → 422
- [X] T021 [US2] Formulario de inscripción para ventas:
      `src/components/enrollments/enroll-form.tsx` + pantalla de alta (dentro
      de la vista de cohorte o como acción propia)

**Checkpoint**: ventas inscribe sin Excel, sin duplicar contactos.

---

## Phase 5: User Story 3 - Soporte hace seguimiento del onboarding por cohorte (Priority: P1)

**Goal**: pantalla de cohorte compartida entre soporte y ventas/coordinación,
con checklist de onboarding; soporte nunca ve datos financieros.

**Independent Test**: `GET` el roster como rol `soporte` → no trae
`amount`/`invoiceNumber`/`sellerId`/`companyId`; `PATCH` un ítem del checklist
→ visible también para ventas/coordinación en la misma pantalla.

- [X] T022 [US3] En `src/server/enrollments.ts`: `getCohortRoster(cohortId,
      role)` — arma el DTO por inscripción; incluye campos financieros solo si
      `role !== "soporte"` (regla dura en servidor, `contracts/cohort-roster.md`);
      "licencia asignada" se lee de `license.assigned`/`assignedAt` (no se
      duplica, DV-004)
- [X] T023 [US3] En `src/server/enrollments.ts`: `updateChecklist(enrollmentId,
      fields)` — actualiza `termsEmailSentAt`, `softwareInstalledAt`,
      `hadOwnLicense`, `academiaOnlineAccessAt`; accesible a cualquier rol
- [X] T024 [US3] `src/app/api/cohorts/[id]/roster/route.ts` (`GET`, `withAuth`
      normal — ambos roles acceden)
- [X] T025 [US3] `src/app/api/enrollments/[id]/checklist/route.ts` (`PATCH`)
- [X] T026 [P] [US3] Test unitario en `tests/unit/roster.test.ts` (nuevo): el
      DTO oculta campos financieros cuando `role === "soporte"` y los incluye
      para cualquier otro rol; `updateChecklist` persiste cada campo
      independientemente
- [X] T027 [US3] Pantalla compartida de cohorte:
      `src/components/cohorts/roster-client.tsx` +
      `src/app/(app)/cohorts/[id]/page.tsx` — lista de inscripciones +
      checklist editable; oculta la sección financiera en el cliente cuando el
      DTO no la trae (además de la regla de servidor de T022)

**Checkpoint**: reemplazo completo de los dos Excel — cierre del MVP
(US1+US2+US3).

---

## Phase 6: User Story 4 - Inventario de licencias con alerta de faltante (Priority: P2)

**Goal**: pool de licencias por software; bloqueo al asignar sin stock;
advertencia al planificar una cohorte que lo supera.

**Independent Test**: configurar total de licencias, asignar hasta agotar →
409/422 en la siguiente asignación; cohorte con cupo > disponibles → advertencia
no bloqueante.

- [X] T028 [US4] Crear `src/server/licenses.ts`: `availableLicenses(softwareId)`,
      `assignLicense(enrollmentId, softwareId)` (rechaza si `available === 0`,
      FR-003), `unassignLicense(enrollmentId)` (libera el pool)
- [X] T029 [US4] En `src/server/courses.ts` (`createCohort`/`updateCohort`):
      calcular y devolver `licenseWarnings` cuando `capacity` de la cohorte
      supera `availableLicenses` de alguno de sus `software` declarados
      (FR-006, no bloquea)
- [X] T030 [US4] `src/app/api/enrollments/[id]/license/route.ts` (`PUT` asignar
      con `softwareId`, `DELETE` liberar)
- [X] T031 [US4] Extender `src/app/api/software/route.ts` con `PATCH`: editar
      `totalLicenses`, rechazando si el nuevo total es menor a las licencias
      `assigned` actuales (FR-004)
- [X] T032 [P] [US4] Test unitario en `tests/unit/licenses.test.ts` (nuevo):
      pool se descuenta al asignar y se libera al liberar/dar de baja;
      asignar con `available === 0` rechaza; `licenseWarnings` aparece cuando
      corresponde y no bloquea la creación; bajar `totalLicenses` por debajo de
      lo asignado rechaza

**Checkpoint**: coordinación ve alertas de licencias antes de comprometerse.

---

## Phase 7: User Story 5 - Alertar choques de horario de un profesor (Priority: P3)

**Goal**: advertencia (no bloqueo) al asignar a un profesor una cohorte
superpuesta con otra que ya tiene.

**Independent Test**: dos cohortes del mismo profesor con fechas superpuestas →
advertencia en la respuesta al guardar la segunda; la creación NO se bloquea.

- [X] T033 [US5] En `src/server/teachers.ts`: `findScheduleConflicts(teacherId,
      startDate, endDate, excludeCohortId?)` — superposición de rango de
      fechas (DV-006; `endDate` NULL = "en curso")
- [X] T034 [US5] Integrar en `src/server/courses.ts`
      (`createCohort`/`updateCohort`): devolver `scheduleWarnings` con las
      cohortes en conflicto, sin bloquear (FR-008)
- [X] T035 [P] [US5] Test unitario en `tests/unit/teachers.test.ts` (nuevo):
      superposición detectada entre dos cohortes del mismo profesor; cohortes de
      profesores distintos no generan advertencia; `endDate` NULL se trata como
      en curso

**Checkpoint**: coordinación ve el choque antes de confirmar.

---

## Phase 8: User Story 6 - Calendario y dashboard financiero (Priority: P3)

**Goal**: calendario de cohortes por fecha; panel en el home con facturación del
mes vs. el anterior, solo para acceso completo.

**Independent Test**: cohortes con fechas distintas aparecen ubicadas en el
calendario; el home muestra el total facturado del mes actual vs. el anterior
para el rol con acceso completo, y 403 para `soporte`.

- [X] T036 [US6] Crear `src/server/finance.ts`: `monthlyRevenue(organizationId,
      month)` — suma `enrollment.amount` agrupado por mes de `enrolledAt`/
      `createdAt`
- [X] T037 [US6] `src/app/api/dashboard/finance/route.ts` (`GET`, usa
      `requireFullAccess` de T004 — 403 para `soporte`)
- [X] T038 [P] [US6] Test unitario en `tests/unit/finance.test.ts` (nuevo):
      total del mes actual vs. el anterior calculado correctamente; ruta
      responde 403 para `role: "soporte"` (integración con T004/T005)
- [X] T039 [US6] `src/components/dashboard/finance-panel.tsx` — integrar en el
      home existente, visible solo para acceso completo
- [X] T040 [US6] `src/components/calendar/calendar-client.tsx` +
      `src/app/(app)/calendar/page.tsx` — vista de calendario sobre
      `listCohorts` (T008), sin datos nuevos

**Checkpoint**: vista general sin sumar planillas a mano.

---

## Phase 9: User Story 7 - Publicar el catálogo de cursos para el sitio web (Priority: P3)

**Goal**: endpoint público de solo lectura con cursos y próximos comienzos, sin
exponer el CRM.

**Independent Test**: sin sesión, `GET /api/public/courses` devuelve 200 con
cursos y cohortes futuras; una cohorte ya iniciada NO aparece; la respuesta nunca
incluye datos de alumnos.

- [X] T041 [US7] Crear `src/server/public-catalog.ts`: `resolveSoleOrganizationId()`
      (DV-010, mismo criterio que `isPublicSignupAllowed`), `listPublicCourses()`,
      `getPublicCourse(courseId)` — `nextCohorts` solo con `startDate > now()`
      (FR-021), DTO reducido que nunca toca `contact`/`enrollment` (FR-022)
- [X] T042 [US7] `src/app/api/public/courses/route.ts` (`GET`, sin `withAuth`)
- [X] T043 [US7] `src/app/api/public/courses/[id]/route.ts` (`GET`, sin
      `withAuth`, 404 si no existe)
- [X] T044 [P] [US7] Test unitario en `tests/unit/public-catalog.test.ts`
      (nuevo): excluye cohortes iniciadas/finalizadas; el DTO no expone ningún
      campo de `contact`/`enrollment`/`license`; 404 en curso inexistente

**Checkpoint**: el sitio externo consume el catálogo sin acceso al CRM.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T045 [P] `src/components/app-nav.tsx`: sumar el grupo "Gestión" (pendiente
      de la conversación previa a esta spec) con los accesos nuevos —
      académico (T014), calendario (T040) — ahora que las pantallas existen
- [X] T046 Gate técnico completo en verde: `pnpm typecheck`, `pnpm lint`,
      `pnpm build`, `pnpm test`
- [X] T047 Verificación en vivo (Principio IX — aplica de lleno esta vez):
      ejecutar `quickstart.md` de punta a punta contra Postgres real, camino
      feliz Y casos infelices (duplicado de contacto, licencia agotada, choque
      de horario, acceso denegado a soporte en finanzas, endpoint público sin
      sesión)
- [X] T048 Actualizar `Status` de `specs/005-gestion-academica-operativa/spec.md`
      a `Implemented` recién cuando T047 quede verde (mismo criterio que la
      Fase 1: no copiar el estado sin haber corrido nada en vivo)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: sin dependencias.
- **Foundational (T002-T005)**: depende de T001 — BLOQUEA todas las user
  stories.
- **User Stories (Phase 3-9)**: todas dependen de Foundational.
  - US1 (T006-T014) es la base de datos/API que las demás reutilizan
    (`software`, `teacher`, `cohort` ampliada) — conviene implementarla primero
    aunque en teoría US1/US2 podrían avanzar en paralelo por tocar archivos
    distintos.
  - US2 (T015-T021) depende de que exista `company` (propia) y reutiliza
    `contact`/`courses` de la Fase 1 — no depende de US1 en código, solo en
    orden lógico de negocio (inscribir requiere una cohorte creada).
  - US3 (T022-T027) depende de que `enrollment` tenga los campos comerciales
    (T002) y de US1/US2 para tener datos que mostrar en el roster.
  - US4 (T028-T032) depende de `software`/`license.software_id` (T002, T007) —
    puede avanzar en paralelo con US3.
  - US5 (T033-T035) depende de `teacher`/`cohort.teacher_id` (T002, T006) —
    independiente de US2/US3/US4.
  - US6 (T036-T040) depende de `enrollment.amount` (T002, US2) y de
    `listCohorts` (T008, US1).
  - US7 (T041-T044) depende solo de `course`/`cohort` (Foundational + US1), es
    la más independiente del resto.
- **Polish (T045-T048)**: depende de que todas las stories elegidas para esta
  entrega estén completas.

### Notas de paralelismo

- T002 (schema.ts) no es paralela con ninguna otra tarea que la edite; T003
  depende de su contenido final.
- T004/T005 (helpers de auth) son paralelas entre sí y con T002/T003 (archivos
  distintos).
- Dentro de cada user story, las tareas de test (`[P]`) son paralelas a las de
  implementación de OTRA story, pero no a las tareas no-`[P]` de la misma story
  de las que dependen (necesitan el código que están probando).
- US4 y US5 son mutuamente independientes (software/licencias vs.
  profesor/horario) y pueden implementarse en paralelo una vez cerrado US1.

---

## Implementation Strategy

### MVP First (User Stories 1, 2 y 3 — reemplazo completo de los dos Excel)

1. Completar Phase 1 (Setup) y Phase 2 (Foundational).
2. Completar Phase 3 (US1) → Phase 4 (US2) → Phase 5 (US3), en ese orden: cada
   una es prerequisito de negocio de la siguiente (planificar cohorte → inscribir
   → hacer seguimiento).
3. **Parar y validar**: correr `quickstart.md` pasos 1-2 y 5-6 contra Postgres
   real (Constitución IX).
4. Recién ahí evaluar si US4-US7 se implementan en la misma entrega o se
   entregan como una segunda tanda (son mejoras sobre el MVP, no bloquean el
   reemplazo de las planillas).

### Entrega incremental

1. Setup + Foundational → base lista.
2. US1 → coordinación planifica cohortes completas.
3. US2 → ventas inscribe sin duplicar.
4. US3 → soporte hace seguimiento — **cierre del MVP**, las dos planillas ya no
   hacen falta.
5. US4 → alerta de licencias (mejora sobre un dolor real, no bloqueante).
6. US5 → alerta de choque de horario.
7. US6 → calendario + dashboard (visibilidad).
8. US7 → endpoint público (marketing/ventas externo).
9. Polish → sidebar agrupado + gate técnico + verificación en vivo completa.

Dado el tamaño de esta fase (48 tareas, ~10 tablas nuevas/ampliadas, ~15 rutas),
si el volumen de cambio por PR importa, el corte natural es MVP (Phases 1-5) vs.
resto (Phases 6-10) — cada uno es un incremento demostrable por separado.
