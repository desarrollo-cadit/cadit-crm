# Tasks: Correcciones configurables y escolaridad automática

**Input**: `specs/031-correcciones-escolaridad/` (plan, spec, research, data-model, contracts, quickstart)

**Tests**: OBLIGATORIOS — Strict TDD: cada test se escribe primero y se ve fallar.

Formato: `- [ ] T### [P?] [US?] descripción con ruta`. `[P]` = archivo distinto, sin dependencia pendiente.

## Phase 1: Setup

- [x] T001 Backup de las bases locales antes de migrar en `backups/` (patrón `vocero-pre-00NN-<fecha>.sql`) y confirmar que la última migración es `0053` en `drizzle/meta/_journal.json`

## Phase 2: Foundational (bloquea todas las historias)

- [x] T002 [P] Test que falla: `tests/unit/grading-template.test.ts` — `validarPlantilla` (suma 100, mínimo 1–100 obligatorio en numérica y null en pass_fail, ids únicos, nombres no vacíos, ejercicios solo en numérica), `notaDeCorreccion` (suma o directa), `validarCorreccion` (modo `draft` tolera faltantes; `submit`/`publish` exigen todo; puntaje > máximo con nombre del ejercicio; nota fuera de 1–100; campo obligatorio vacío), `aproboConNota` (nota = mínimo aprueba), `plantillaCongelada` (cambio de escala/mínimo/ids/máximos vs. cambio de nombres)
- [x] T003 Implementar funciones puras y tipos `Template`, `Criterion`, `TextField`, `CorrectionInput` con esquemas Zod en `src/lib/grading-template.ts` hasta poner T002 en verde
- [x] T004 Columnas de plantilla en `assessment` (`scale`, `min_score`, `requires_approval`, `criteria`, `text_fields`), `score` en `assessmentResult` y tabla `correction` con índices únicos parciales en `src/lib/db/schema.ts`; prefijo `correction: "cor"` en `src/lib/db/ids.ts`
- [x] T005 Migración re-ejecutable `drizzle/0054_correcciones_escolaridad.sql` (+ entrada en `drizzle/meta/_journal.json`): columnas con defaults y checks, tabla `correction`, RLS `tenant_isolation` a mano, backfill de `correcciones.aprobar` en roles `direccion` y `coordinacion` (patrón de `0052`)
- [x] T006 [P] Test que falla: agregar `correcciones.aprobar` a las expectativas de `tests/unit/capabilities.test.ts` (dirección y coordinación la tienen; soporte y administración no) 
- [x] T007 Agregar `correcciones.aprobar` a `CAPABILITIES` y a `SYSTEM_ROLES`/filtros en `src/lib/capabilities.ts`; etiqueta en `CAPABILITY_LABELS` y regex de `GROUPS` en `src/components/settings/roles-client.tsx`; entrada en `GUIA_CAPACIDADES` y regex de `GRUPOS_CAPACIDADES` en `src/lib/guia.ts`
- [x] T008 Aplicar la migración en las bases de dev y e2e y correr `pnpm typecheck && pnpm test` (incluye `rls-cobertura.test.ts` cubriendo `correction`)

**Checkpoint**: base lista; ninguna conducta visible cambió todavía.

## Phase 3: US1 — Definir cómo se corrige una evaluación (P1) 🎯

**Independent test**: crear evaluación numérica 40/30/30 + campo de texto; se guarda y relee igual; una evaluación vieja sigue pass_fail; copiar trae la plantilla; cambiar escala con correcciones publicadas → 409.

- [x] T009 [P] [US1] Test que falla en `tests/unit/assessment-copy.test.ts`: `planAssessmentCopy` copia `scale`, `minScore`, `requiresApproval`, `criteria` (ids regenerados) y `textFields`; sigue sin copiar `dueAt`
- [x] T010 [US1] Extender `AssessmentDto`, `listAssessments`, `planAssessmentCopy` y `copyAssessments` con la plantilla en `src/server/grading.ts`
- [x] T011 [US1] `guardarPlantilla(orgId, assessmentId, template)` en `src/server/grading.ts`: valida con `validarPlantilla`, genera ids faltantes, consulta si hay correcciones `published`/`superseded` y aplica `plantillaCongelada` (409 `plantilla_congelada`)
- [x] T012 [US1] Ruta `PUT /api/assessments/[id]/template` con `requireCapability("evaluacion.editar")` + `parseBody` en `src/app/api/assessments/[id]/template/route.ts`
- [x] T013 [US1] `cohortGrading` y `GET /api/cohorts/[id]/grading` devuelven la plantilla por evaluación y `scores` por alumno en `src/server/grading.ts`
- [x] T014 [P] [US1] Editor presentacional de plantilla (escala, mínimo, ejercicios con suma en vivo, campos de texto, "requiere aprobación") en `src/components/grading/template-editor.tsx`, solo tokens de color
- [x] T015 [US1] Abrir el editor desde cada evaluación y mostrar "Numérica · aprueba con N" / nota en celda en `src/components/cohorts/grading-client.tsx`

**Checkpoint**: US1 operable sola.

## Phase 4: US2 — Corregir con nota, ejercicios y comentarios (P1) 🎯

**Independent test**: corregir 35/30→rechazo, 35/20/25 → 80 aprobada (mín. 60); borrador no cambia `grading`; corrección sin entrega; atajos → 422 en numérica.

- [x] T016 [P] [US2] Test que falla `tests/unit/correcciones.test.ts` (con la base de test como los demás tests de servidor): guardar borrador no toca `assessment_result` ni `submission`; publicar escribe `passed` + `score` y espeja en la entrega; republicar deja la anterior `superseded`; corrección sin entrega; inscripción de otra cohorte → 404; `recordResults` guarda `score`
- [x] T017 [US2] `recordResults` acepta `score` opcional y lo escribe en el upsert en `src/server/grading.ts`
- [x] T018 [US2] `src/server/corrections.ts`: `leerCorreccion` (publicada + en trámite + entregas + `mode`), `guardarCorreccion(…, action)` con `validarCorreccion`, y `publicarCorreccion()` (DV-003: marca published/superseded, `recordResults` con score, espeja en `submission`; LANZA ante fallo)
- [x] T019 [US2] Ruta staff `GET|PUT /api/assessments/[id]/corrections/[enrollmentId]` con `requireCapability("evaluacion.editar")`; `mode` según `requires_approval` y `correcciones.aprobar` de la sesión, en `src/app/api/assessments/[id]/corrections/[enrollmentId]/route.ts`
- [x] T020 [US2] Ruta profesor `GET|PUT /api/portal/assessments/[id]/corrections/[enrollmentId]` con `requireTeacherPortal`, alcance `teacherReachesCohort` (404) y cohorte finalizada (422), en `src/app/api/portal/assessments/[id]/corrections/[enrollmentId]/route.ts`
- [x] T021 [P] [US2] Test que falla en `tests/unit/correcciones.test.ts`: `PATCH results` (staff y profesor) y `PATCH /api/portal/entregas/[id]` → 422 `usar_correccion` en numérica o con aprobación; en pass_fail sin aprobación siguen funcionando y la entrega corregida deja una versión `published`
- [x] T022 [US2] Restringir `recordResults` vía rutas (`src/app/api/assessments/[id]/results/route.ts`, `src/app/api/portal/assessments/[id]/results/route.ts` / `teacherRecordResult` en `src/server/teacher-portal.ts`) y hacer que `corregirEntrega` en `src/server/submissions.ts` delegue en `publicarCorreccion()`
- [x] T023 [P] [US2] `CorrectionForm` presentacional (ejercicios con puntaje/máximo/comentario, nota calculada en vivo, campos de texto, devolución, botones según `mode`, comentario de devolución del aprobador si existe) en `src/components/grading/correction-form.tsx`
- [x] T024 [US2] Portal del profesor usa `CorrectionForm` (reemplaza `FormularioDeCorreccion`) y permite corregir alumnos sin entrega en `src/components/portal/portal-submissions.tsx`
- [x] T025 [US2] Staff abre `CorrectionForm` por alumno/evaluación desde la planilla en `src/components/cohorts/grading-client.tsx`
- [x] T026 [US2] Ajustar los guards de texto de UI de `tests/unit/entregas.test.ts` (691-700) a la nueva forma sin perder lo que protegen

**Checkpoint**: US1 + US2 = MVP de corrección (sin aprobación: todo publica directo).

## Phase 5: US3 — El alumno ve toda la corrección publicada (P1) 🎯

**Independent test**: corrección publicada visible completa; borrador/pendiente invisibles; cursada ajena 404.

- [x] T027 [P] [US3] Test que falla `tests/unit/correcciones-guard.test.ts`: en `src/server/corrections.ts` las funciones para el alumno reciben `contactId`, filtran `status = 'published'` en el WHERE, no contienen `403`, y `reviewComment`/`submittedAt`/`reviewedBy` no están en `StudentCorrectionDto`; la ruta usa `requireStudentPortal` y solo exporta GET
- [x] T028 [US3] `correccionesPublicadasDeCursada(orgId, contactId, enrollmentId)` en `src/server/corrections.ts`
- [x] T029 [US3] Ruta `GET /api/portal/me/correcciones` en `src/app/api/portal/me/correcciones/route.ts`
- [x] T030 [US3] Mostrar nota, ejercicios (puntaje/máximo/comentario), campos de texto, devolución, corrector y fecha dentro de cada evaluación en `src/components/portal/student-submissions.tsx`; sin corrección publicada → "Pendiente de corrección"

**Checkpoint**: el pedido central del dueño ("que lo vea sin pedirlo") está cumplido.

## Phase 6: US4 — Aprobar una corrección antes de publicarla (P2)

**Independent test**: profesor envía → alumno no ve, `grading` intacto; devolver con comentario → borrador; aprobar → publicada; editar publicada → la vieja sigue vigente.

- [x] T031 [P] [US4] Tests que fallan en `tests/unit/correcciones.test.ts`: `submit` → `pending`; `publish` sin permiso → 422 `requiere_aprobacion`; editar con `pending` → 409 `en_aprobacion`; aprobar → published + resultado; devolver sin comentario → 422, con comentario → draft; la publicada anterior sigue vigente mientras la nueva está en trámite; auditoría (quién/cuándo)
- [x] T032 [US4] `enviarCorreccion`, `aprobarCorreccion`, `devolverCorreccion`, `listarPendientes(orgId, { cohortId })`, `detalleParaAprobar` en `src/server/corrections.ts`
- [x] T033 [US4] Rutas `GET /api/corrections`, `GET /api/corrections/[id]`, `POST /api/corrections/[id]/approve`, `POST /api/corrections/[id]/return` con `requireCapability("correcciones.aprobar")` en `src/app/api/corrections/**`
- [x] T034 [P] [US4] Bandeja (lista filtrable por cohorte + detalle con la corrección y la entrega + aprobar/devolver) en `src/components/grading/correction-inbox.tsx` y página `src/app/(app)/correcciones/page.tsx`
- [x] T035 [US4] Entrada "Correcciones" en la barra lateral por capacidad en `src/lib/nav.ts`

## Phase 7: US5 — Escolaridad generada automáticamente (P2)

**Independent test**: alumno con un curso aprobado y otro en curso: ambos con notas y estados correctos; "Pendiente" ≠ "No aprobada"; HTML escapado e imprimible para staff y alumno.

- [x] T036 [P] [US5] Test que falla `tests/unit/escolaridad.test.ts`: `armarEscolaridad` (pendiente nunca desaprobada, `sin_datos`, opcional no define estado, especialización con módulos vía `programApprovalState`, orden cronológico, sin nota ponderada) y `renderEscolaridadHtml` (escapa nombres, sin cobranza/teléfono/correo, muestra `N/100`)
- [x] T037 [US5] `armarEscolaridad` y `renderEscolaridadHtml` en `src/lib/escolaridad.ts` usando `estadoDeModulo`/`programApprovalState` de `src/server/grading.ts` (o moviendo los puros a `src/lib` si importar desde server rompe la pureza)
- [x] T038 [US5] `escolaridadDeContacto(orgId, contactId)` en `src/server/transcript.ts` (cursadas, cohortes, cursos, evaluaciones, resultados oficiales con `score`, asistencia con `attendancePercentage`, dispensas, nombre de la academia, `national_id`); no importa `student-record.ts`
- [x] T039 [US5] Ruta staff `GET /api/contacts/[id]/escolaridad/print` (`academico.ver`) en `src/app/api/contacts/[id]/escolaridad/print/route.ts`
- [x] T040 [US5] Ruta alumno `GET /api/portal/me/escolaridad/print` (`requireStudentPortal`) en `src/app/api/portal/me/escolaridad/print/route.ts`
- [x] T041 [P] [US5] Enlace "Escolaridad" en el legajo en `src/components/contacts/student-record-client.tsx`
- [x] T042 [P] [US5] Tarjeta "Mi escolaridad" en el portal del alumno en `src/components/portal/student-dashboard.tsx`

## Phase 8: Polish & cierre

- [ ] T043 Sección E2E `scripts/e2e/correcciones.mjs` (11 pasos de `quickstart.md` §3) registrada en `SECCIONES` y en la corrida completa de `scripts/e2e-selftest.mjs`
- [ ] T044 Gate técnico completo: `pnpm typecheck && pnpm lint && NEXT_DIST_DIR=.next-build pnpm build && pnpm test`
- [ ] T045 E2E en vivo: `E2E_SECCIONES=correcciones pnpm test:e2e` contra la app con mocks + suite completa en verde
- [ ] T046 Playwright en los tres actores (profesor corrige, staff aprueba/devuelve, alumno ve y abre la escolaridad), incluido tema oscuro
- [ ] T047 [P] Nota de reversión de DV-001 apuntando a 031 en `specs/010-evaluacion-y-certificados/spec.md`
- [ ] T048 [P] Actualizar el mapa de código y una sección "Correcciones y escolaridad (ciclo 031)" en `CLAUDE.md`

## Dependencies

- Phase 2 bloquea todo. US1 → US2 (la corrección necesita plantilla). US3 y US4 dependen de US2 (`publicarCorreccion`). US5 depende solo de Phase 2 + `score` (T017) y puede ir en paralelo a US3/US4.
- Orden sugerido: Setup → Foundational → US1 → US2 → US3 → US4 → US5 → Polish.

## Parallel examples

- Phase 2: T002 y T006 (tests en archivos distintos).
- US1: T009 y T014 mientras se hace T010–T011.
- US2: T016, T021 y T023 juntos antes de T018.
- US5: T036, T041, T042.

## Implementation strategy

MVP = US1 + US2 + US3: plantillas, corrección rica y el alumno viéndola. US4
(aprobación) y US5 (escolaridad) se suman encima sin rehacer nada. Commit por
fase, cada uno con sus tests.
