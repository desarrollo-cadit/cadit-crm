---

description: "Lista de tareas de 046 — Recorrido comercial del alumno"
---

# Tasks: Recorrido comercial del alumno

**Input**: documentos de diseño en `/specs/046-recorrido-comercial/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/](./contracts/), [quickstart.md](./quickstart.md), constitución 1.8.0.

**Tests**: TDD estricto. Toda unidad de lógica tiene ANTES una tarea que
escribe el test en `tests/unit/` y lo deja en ROJO; la tarea siguiente lo pone
en verde. El dueño decidió **no correr E2E en vivo**: no hay tareas de E2E; la
UI queda "pendiente de verificación humana" (quickstart §4).

**Organization**: por historia. US1–US4 son P1; US5 es P2. Gate al cerrar
cada fase: `pnpm typecheck && pnpm lint && pnpm test`, y un commit
convencional por fase.

**Entorno**: no hace falta tocar `.env.example` (sin variables nuevas).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelizable (archivos disjuntos, sin dependencias pendientes)
- **[Story]**: historia (US1…US5); solo en las fases de historia

## Reglas del proyecto que toda tarea respeta

- Capacidades, no roles: `requireCapability("<cap>")`; nunca nombres de rol.
- RLS a mano en la migración; consultas con `scoped()`.
- Un dato que no se debe ver no viaja: nada de montos en el historial ni en Recompra.
- UI: solo tokens de color, voseo institucional, el término visible es "grupo".
- La definición de "cursó/aprobó" vive SOLO en `src/lib/recorrido-comercial.ts` (FR-010).

---

## Phase 1: Foundational (bloquea a todas las historias)

**Purpose**: la tabla de rutas y la derivación única del historial.

- [x] T001 [P] Test en rojo de la migración: `tests/unit/migracion-rutas.test.ts` exige `drizzle/0072_rutas_entre_cursos.sql` con `create table if not exists "course_route"`, RLS + `tenant_isolation`, CHECK `course_route_no_self` y FKs dentro de `do $$` contra `pg_constraint`, índices `if not exists` (FR-005, FR-013)
- [x] T002 Tabla `courseRoute` en `src/lib/db/schema.ts` (org, from, to, position, created_by, created_at; unique org+from+to; índice org+from+position; CHECK from ≠ to) y prefijo `courseRoute: "crr"` en `src/lib/db/ids.ts`
- [x] T003 Generar y reescribir a mano `drizzle/0072_rutas_entre_cursos.sql` re-ejecutable (+ `drizzle/meta/_journal.json`, `drizzle/meta/0072_snapshot.json`); T001 y `tests/unit/rls-cobertura.test.ts` en verde
- [x] T004 [P] Test en rojo `tests/unit/estado-de-cursada.test.ts`: `estadoDeAprobacionDeCursada` — sin marcas → `pct` null y `sin_datos` si no hay obligatorias; obligatoria desaprobada → `reprobado`; dispensa vigente saltea solo la asistencia; mínimo del grupo gana al del curso (FR-001, R2)
- [x] T005 Extraer `estadoDeAprobacionDeCursada` a `src/server/estado-de-cursada.ts` desde `armarCursada` de `src/server/student-record.ts`, que pasa a llamarla sin cambiar comportamiento (`tests/unit/student-record.test.ts` sigue verde)
- [x] T006 [P] Test en rojo `tests/unit/recorrido-comercial.test.ts`: `historialesComerciales` — los cuatro estados; nunca dictada no cuenta; lead sin grupo y taller no cuentan; especialización una vez con módulos aprobados; recursada = una entrada con el mejor estado y `veces`; `lost` antes de empezar no cuenta y después es "cursó sin aprobar"; certificado vigente = aprobó; `sinResultado` (FR-001..FR-003, SC-003)
- [x] T007 Implementar `src/lib/recorrido-comercial.ts` (`CursadaComercial`, `EntradaDeHistorial`, `estadoComercialDeCursada`, `historialesComerciales`, `esCursado`, `ESTADO_COMERCIAL_LABEL`) hasta poner T006 en verde
- [x] T008 [P] Test en rojo `tests/unit/recorrido-comercial-servidor.test.ts`: `armarCursadasComerciales(piezas)` (la madre se compone con `programApprovalState` en la derivación pura, T006) marca `nuncaDictada` desde el set de `inscripcionesNoDictadas`, saca talleres y leads, y calcula la aprobación de cada cursada con `estadoDeAprobacionDeCursada`
- [x] T009 Implementar `src/server/recorrido-comercial.ts`: `armarCursadasComerciales` (sin base) y `cargarCursadasComerciales(orgId, { contactIds? })` (lectura en lote con `scoped()`, ≤ 8 consultas, reusa `inscripcionesNoDictadas`) y `historialesDeLaOrganizacion(orgId)` hasta poner T008 en verde
- [x] T010 Probar la 0072 en un PostgreSQL descartable (quickstart §2): 0000→0072, 0072 dos veces, RLS activa, CHECK rechaza autorreferencia

**Checkpoint**: gate verde → commit `feat(recorrido): ...` de la fase.

---

## Phase 2: User Story 1 — Saber qué cursó de verdad cada persona (P1) 🎯 MVP

**Goal**: el historial comercial en la ficha del contacto (pestaña Seguimiento).

**Independent Test**: un contacto con un curso aprobado, uno cursado sin aprobar, uno en curso y uno en un grupo que nunca se dictó muestra los tres primeros y no el cuarto.

- [x] T011 [P] [US1] Test en rojo `tests/unit/recorrido-comercial-contacto.test.ts`: `historialADto` serializa fechas a ISO y no lleva montos; la ruta `src/app/api/contacts/[id]/recorrido-comercial/route.ts` pide `contactos.ver` y responde 404 si `recorridoComercialDelContacto` devuelve `null`
- [x] T012 [US1] Implementar `recorridoComercialDelContacto(orgId, contactId)` + `historialADto` en `src/server/recorrido-comercial.ts` y la ruta GET `src/app/api/contacts/[id]/recorrido-comercial/route.ts` (FR-004)
- [x] T013 [US1] Tarjeta "Cursos que hizo" en `src/components/contacts/recorrido-comercial-card.tsx` (estado como `Badge`, grupo, fechas, "Especialización · N de M módulos aprobados", "sin resultado cargado") y montarla arriba en `src/components/contacts/seguimiento-client.tsx`

**Checkpoint**: gate verde → commit de US1.

---

## Phase 3: User Story 2 — Definir qué curso sigue a cuál (P1)

**Goal**: Coordinación carga y ordena los cursos siguientes desde Académico.

**Independent Test**: cargar dos siguientes, reordenar, quitar uno: queda guardado en ese orden.

- [x] T014 [P] [US2] Test en rojo `tests/unit/rutas-de-cursos.test.ts` (parte rutas): `validarSiguientes` — rechaza autorreferencia, repetidos, cursos inexistentes y talleres; acepta lista vacía y ciclos (FR-005)
- [x] T015 [US2] Implementar `validarSiguientes` en `src/lib/rutas-de-cursos.ts`
- [x] T016 [P] [US2] Test en rojo `tests/unit/course-routes-servidor.test.ts`: `guardarSiguientes` borra e inserta en orden con `position` = índice; curso ajeno → `not_found`; inválido → `invalid_body` sin escribir; `listarRutas` agrupa en orden
- [x] T017 [US2] Implementar `src/server/course-routes.ts` (`listarRutas`, `rutasPorCurso`, `guardarSiguientes`)
- [x] T018 [US2] Rutas `src/app/api/course-routes/route.ts` (GET, `academico.ver`) y `src/app/api/courses/[id]/next-courses/route.ts` (PUT, `academico.editar`, Zod `.strict()`) según contracts/course-routes.md (FR-006)
- [x] T019 [US2] Diálogo `src/components/academic/next-courses-dialog.tsx` (agregar, subir/bajar, quitar, guardar) y en `src/components/academic/academic-client.tsx` la línea "Siguen: …" por curso y el botón "Cursos siguientes" solo con `canEdit`

**Checkpoint**: gate verde → commit de US2.

---

## Phase 4: User Story 3 — "Le podría interesar…" (P1)

**Goal**: sugerencias de recompra en Seguimiento.

**Independent Test**: aprobó Arquitectura, ruta → MEP, Estructura, ya inscripta en Estructura: se sugiere solo MEP con su próximo grupo.

- [x] T020 [P] [US3] Test en rojo en `tests/unit/rutas-de-cursos.test.ts`: `sugerenciasDeRecompra` (orden de la ruta, sin repetidos, sin lo hecho ni inscripto, sin no publicados ni talleres, solo desde cursos cursados, `porCursos`) y `proximoGrupoAbierto` (primer grupo planificado, no módulo; null si no hay) (FR-007)
- [x] T021 [US3] Implementar `sugerenciasDeRecompra` y `proximoGrupoAbierto` en `src/lib/rutas-de-cursos.ts`
- [x] T022 [US3] `recorridoComercialDelContacto` suma `sugerencias` (rutas de `rutasPorCurso`, cursos publicados y próximos grupos leídos con `scoped()`), con su caso en `tests/unit/recorrido-comercial-contacto.test.ts`
- [x] T023 [US3] Sección "Le podría interesar" en `src/components/contacts/recorrido-comercial-card.tsx` (próximo grupo o "Sin grupo abierto por ahora"); no se dibuja si no hay sugerencias

**Checkpoint**: gate verde → commit de US3.

---

## Phase 5: User Story 4 — Segmentar por historial para una campaña (P1)

**Goal**: filtros de historial en las audiencias de la 045.

**Independent Test**: "aprobaron A y no hicieron B" devuelve exactamente a quienes cumplen y excluye a quienes se dieron de baja.

- [x] T024 [P] [US4] Test en rojo en `tests/unit/marketing-audiencia.test.ts`: claves nuevas de `AudienceFiltersSchema` válidas; `months` fuera de rango, listas vacías y claves desconocidas rechazadas; una audiencia guardada sin claves nuevas sigue valiendo (FR-008)
- [x] T025 [US4] Sumar las claves a `AudienceFiltersSchema` en `src/lib/marketing/audience.ts`
- [x] T026 [P] [US4] Test en rojo `tests/unit/marketing-historial-filtros.test.ts`: `cumpleFiltrosDeHistorial` por filtro; AND entre filtros; 10 aprobaron A, 3 con B → 7; nunca dictada no cuenta como cursó; atajo de ruta; últimos N meses por curso y por categoría; historial vacío cumple solo "no hizo" (FR-008..FR-010)
- [x] T027 [US4] Implementar `src/lib/marketing/historial-filtros.ts` (`tieneFiltrosDeHistorial`, `cumpleFiltrosDeHistorial`, `contactosQueCumplen`)
- [x] T028 [P] [US4] Test en rojo `tests/unit/marketing-audiencias-historial.test.ts`: `condicionDeHistorial` devuelve `IN` o `NOT IN` según DV-008; sin filtros de historial no lee historiales; combinado con filtros de la 045, `particionarAudiencia` sigue excluyendo baja, archivado y sin correo
- [x] T029 [US4] En `src/server/marketing/audiences.ts`: `condicionDeHistorial` en `condicionesDeFiltros` (usa `historialesDeLaOrganizacion` y `rutasPorCurso`), y `categories` en `opcionesDeFiltros`
- [x] T030 [US4] Sección "Historial de cursos" en `src/components/marketing/audience-builder.tsx` (cursó / aprobó / cursó sin aprobar / no hizo / últimos N meses por curso o categoría / siguiente paso de la ruta de un curso)

**Checkpoint**: gate verde → commit de US4.

---

## Phase 6: User Story 5 — Medir la recompra (P2)

**Goal**: pestaña Recompra en Marketing.

**Independent Test**: con un historial conocido, las tres cifras coinciden con el cálculo a mano.

- [x] T031 [P] [US5] Test en rojo `tests/unit/marketing-recompra.test.ts`: 100 personas, 30 con dos o más → 30 %; días promedio; pares consecutivos contados por persona, top 10; el período recalcula; `periodoDeRecompra` valida fechas (FR-011)
- [x] T032 [US5] Implementar `src/lib/marketing/recompra.ts` (`metricasDeRecompra`, `periodoDeRecompra`)
- [x] T033 [US5] `src/server/marketing/recompra.ts` (`recompraDeLaOrganizacion`) y ruta `src/app/api/marketing/recompra/route.ts` (GET, `marketing.ver`, 422 `invalid_query`) (FR-012)
- [x] T034 [US5] `src/components/marketing/repurchase-view.tsx` (período: últimos 12 meses / este año / todo / a medida; tres cifras y tabla de pares) y pestaña "Recompra" en `src/app/(app)/marketing/page.tsx`

**Checkpoint**: gate verde → commit de US5.

---

## Phase 7: Polish & Cross-Cutting

- [x] T035 Guard `tests/unit/recorrido-comercial-guard.test.ts`: solo `src/lib/recorrido-comercial.ts` decide estados comerciales; el loader usa `inscripcionesNoDictadas` y `estadoDeAprobacionDeCursada`; ningún archivo nuevo lee `installment`, `payment` ni `amount`; las rutas nuevas declaran su capacidad (FR-010, FR-012, SC-003)
- [x] T036 [P] `CLAUDE.md`: fila "Recorrido comercial" en el mapa del código; `specs/ROADMAP.md`: el ítem pasa a implementado (046)
- [x] T037 Gate final completo y marcar todas las tareas

**Checkpoint**: gate verde → commit de cierre.

---

## Phase 8: User Story 6 — Datos y derivación de cursadas históricas (P1)

**Goal**: guardar cursadas históricas sin grupos falsos y contarlas en el historial comercial.

**Independent Test**: una cursada histórica de Revit Arquitectura hace que la persona entre en "cursó Revit Arquitectura" y no en "aprobó"; la ficha la muestra con "Registro histórico".

- [x] T038 [P] [US6] Test en rojo `tests/unit/migracion-historial.test.ts`: `drizzle/0073_historial_importado.sql` crea `historical_import_batch` y `historical_course_taking` con `if not exists`, RLS + `tenant_isolation`, CHECK de `status`, FKs en `do $`, UNIQUE `(organization_id, dedup_key)`, y suma `historial.importar` solo al rol `direccion` (FR-019, FR-022)
- [x] T039 [US6] Tablas `historicalImportBatch` y `historicalCourseTaking` en `src/lib/db/schema.ts`, prefijos `hib`/`hct` en `src/lib/db/ids.ts`; generar y reescribir a mano `drizzle/0073_historial_importado.sql` (+ journal y snapshot)
- [x] T040 [US6] Capacidad `historial.importar` en `src/lib/capabilities.ts` (solo Dirección: fuera de coordinación y soporte), `src/lib/guia.ts`, `src/components/settings/roles-client.tsx`; ajustar `tests/unit/{capabilities,seed-roles,migracion-cuentas,finanzas-periodo}.test.ts` (la pestaña y la pantalla llegan en T054, con el importador funcionando)
- [x] T041 [P] [US6] Test en rojo en `tests/unit/recorrido-comercial.test.ts`: `historialesComerciales(cursadas, now, historicos)` — estado `curso_historico` (cursado, nunca aprobó), texto sin catálogo como `texto:<label>`, un dato real del mismo curso gana, edición en `cohortName`, `etiquetaDeEntrada` = "Cursó (registro histórico)" (FR-021)
- [x] T042 [US6] `RegistroHistorico` y `curso_historico` en `src/lib/recorrido-comercial.ts`
- [x] T043 [P] [US6] Test en rojo en `tests/unit/marketing-historial-filtros.test.ts` y `tests/unit/rutas-de-cursos.test.ts`: una cursada histórica cuenta para cursó / no hizo / últimos N meses / sugerencias, nunca para aprobó ni cursó sin aprobar
- [x] T044 [US6] `cargarRegistrosHistoricos` en `src/server/recorrido-comercial.ts` y su uso en `historialesDeLaOrganizacion` y `recorridoComercialDelContacto` (con su caso en `tests/unit/recorrido-comercial-contacto.test.ts`)
- [x] T045 [US6] Insignia "Registro histórico" en `src/components/contacts/recorrido-comercial-card.tsx`
- [x] T046 Probar la 0073 en un PostgreSQL descartable (0000→0073, 0073 dos veces, RLS, único de `dedup_key`)

**Checkpoint**: gate verde → commit.

---

## Phase 9: User Story 6 — El importador (P1)

**Goal**: leer la planilla, asociar, simular y aplicar por tandas, deshacer.

- [ ] T047 [P] [US6] Fixture inventada `tests/fixtures/historial-planilla.csv` (BOM, comillas, filas con problemas; ningún dato real) y test en rojo `tests/unit/historial-csv.test.ts`: `leerCsv` (BOM, comillas, comas y saltos dentro de comillas, CRLF) y `leerPlanilla` (encabezado exacto, correo/teléfono normalizados, al menos uno, fecha real, curso y nombre obligatorios, problemas con número de fila) (FR-014)
- [ ] T048 [US6] Implementar `src/lib/historial-import/csv.ts` y `src/lib/historial-import/planilla.ts`
- [ ] T049 [P] [US6] Test en rojo `tests/unit/historial-plan.test.ts`: `sugerirCurso` (sin tildes ni mayúsculas, exacto), `sugerirVendedor` (nombre o iniciales únicas), `validarMapeo`, `planDeImportacion` — reconoce por correo y después por teléfono, crea una sola vez a quien aparece en varias filas, completa solo vacíos, no completa un correo/teléfono ajeno, empresa existente o nueva, cursada nueva / ya presente / repetida en el archivo, `dedupKey` (FR-015..FR-019)
- [ ] T050 [US6] Implementar `src/lib/historial-import/plan.ts`
- [ ] T051 [P] [US6] Test en rojo `tests/unit/historial-import-servidor.test.ts`: `aplicarTanda` procesa 300 filas, crea empresas y contactos antes que las cursadas, inserta con `on conflict do nothing`, acumula contadores, vacía `pending_rows` al terminar; `deshacerImportacion` borra solo las cursadas de esa importación; importación ajena → `null`
- [ ] T052 [US6] Implementar `src/server/historial-import.ts` (`analizarPlanilla`, `vistaPrevia`, `crearImportacion`, `aplicarTanda`, `deshacerImportacion`, `listarImportaciones`)
- [ ] T053 [US6] Rutas `src/app/api/historial/importaciones/{route.ts,analizar/route.ts,vista-previa/route.ts,[id]/route.ts,[id]/aplicar/route.ts}` con `historial.importar` y Zod `.strict()` según contracts/historical-import.md (FR-020, FR-022)

**Checkpoint**: gate verde → commit.

---

## Phase 10: User Story 6 — La pantalla Importar historial (P1)

- [ ] T054 [US6] Pestaña `/settings/historial` en `src/lib/nav.ts` (+ caso en `tests/unit/settings-acceso.test.ts`), `src/app/(app)/settings/historial/page.tsx` (gate `historial.importar`) y `src/components/settings/historial-import-client.tsx`: subir CSV; paso 1 asociaciones (cursos con "Dejar como texto", vendedores con "Sin vendedor"); paso 2 vista previa con cantidades y problemas; paso 3 confirmar con avance por tandas y "Continuar"; lista de importaciones con "Deshacer esta importación"
- [ ] T055 [US6] Guard en `tests/unit/recorrido-comercial-guard.test.ts`: rutas del importador con `historial.importar`; el importador no lee plata; ningún CSV real en `tests/fixtures` (solo la planilla inventada)
- [ ] T056 `CLAUDE.md` (fila "Importar historial"), quickstart §5, gate final y marcar tareas

**Checkpoint**: gate verde → commit.

---

## Dependencies & Execution Order

- Phases 8 → 9 → 10 (US6) van en orden y dependen de la Phase 1.
- Phase 1 bloquea todo. US1 → US3 (la tarjeta crece). US2 → US3 (sugerencias usan rutas) y → US4 (atajo de ruta). US5 depende solo de Phase 1.
- Dentro de cada fase: test en rojo antes de su implementación.
