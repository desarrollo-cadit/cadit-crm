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

- [ ] T011 [P] [US1] Test en rojo `tests/unit/recorrido-comercial-contacto.test.ts`: `historialADto` serializa fechas a ISO y no lleva montos; la ruta `src/app/api/contacts/[id]/recorrido-comercial/route.ts` pide `contactos.ver` y responde 404 si `recorridoComercialDelContacto` devuelve `null`
- [ ] T012 [US1] Implementar `recorridoComercialDelContacto(orgId, contactId)` + `historialADto` en `src/server/recorrido-comercial.ts` y la ruta GET `src/app/api/contacts/[id]/recorrido-comercial/route.ts` (FR-004)
- [ ] T013 [US1] Tarjeta "Cursos que hizo" en `src/components/contacts/recorrido-comercial-card.tsx` (estado como `Badge`, grupo, fechas, "Especialización · N de M módulos aprobados", "sin resultado cargado") y montarla arriba en `src/components/contacts/seguimiento-client.tsx`

**Checkpoint**: gate verde → commit de US1.

---

## Phase 3: User Story 2 — Definir qué curso sigue a cuál (P1)

**Goal**: Coordinación carga y ordena los cursos siguientes desde Académico.

**Independent Test**: cargar dos siguientes, reordenar, quitar uno: queda guardado en ese orden.

- [ ] T014 [P] [US2] Test en rojo `tests/unit/rutas-de-cursos.test.ts` (parte rutas): `validarSiguientes` — rechaza autorreferencia, repetidos, cursos inexistentes y talleres; acepta lista vacía y ciclos (FR-005)
- [ ] T015 [US2] Implementar `validarSiguientes` en `src/lib/rutas-de-cursos.ts`
- [ ] T016 [P] [US2] Test en rojo `tests/unit/course-routes-servidor.test.ts`: `guardarSiguientes` borra e inserta en orden con `position` = índice; curso ajeno → `not_found`; inválido → `invalid_body` sin escribir; `listarRutas` agrupa en orden
- [ ] T017 [US2] Implementar `src/server/course-routes.ts` (`listarRutas`, `rutasPorCurso`, `guardarSiguientes`)
- [ ] T018 [US2] Rutas `src/app/api/course-routes/route.ts` (GET, `academico.ver`) y `src/app/api/courses/[id]/next-courses/route.ts` (PUT, `academico.editar`, Zod `.strict()`) según contracts/course-routes.md (FR-006)
- [ ] T019 [US2] Diálogo `src/components/academic/next-courses-dialog.tsx` (agregar, subir/bajar, quitar, guardar) y en `src/components/academic/academic-client.tsx` la línea "Siguen: …" por curso y el botón "Cursos siguientes" solo con `canEdit`

**Checkpoint**: gate verde → commit de US2.

---

## Phase 4: User Story 3 — "Le podría interesar…" (P1)

**Goal**: sugerencias de recompra en Seguimiento.

**Independent Test**: aprobó Arquitectura, ruta → MEP, Estructura, ya inscripta en Estructura: se sugiere solo MEP con su próximo grupo.

- [ ] T020 [P] [US3] Test en rojo en `tests/unit/rutas-de-cursos.test.ts`: `sugerenciasDeRecompra` (orden de la ruta, sin repetidos, sin lo hecho ni inscripto, sin no publicados ni talleres, solo desde cursos cursados, `porCursos`) y `proximoGrupoAbierto` (primer grupo planificado, no módulo; null si no hay) (FR-007)
- [ ] T021 [US3] Implementar `sugerenciasDeRecompra` y `proximoGrupoAbierto` en `src/lib/rutas-de-cursos.ts`
- [ ] T022 [US3] `recorridoComercialDelContacto` suma `sugerencias` (rutas de `rutasPorCurso`, cursos publicados y próximos grupos leídos con `scoped()`), con su caso en `tests/unit/recorrido-comercial-contacto.test.ts`
- [ ] T023 [US3] Sección "Le podría interesar" en `src/components/contacts/recorrido-comercial-card.tsx` (próximo grupo o "Sin grupo abierto por ahora"); no se dibuja si no hay sugerencias

**Checkpoint**: gate verde → commit de US3.

---

## Phase 5: User Story 4 — Segmentar por historial para una campaña (P1)

**Goal**: filtros de historial en las audiencias de la 045.

**Independent Test**: "aprobaron A y no hicieron B" devuelve exactamente a quienes cumplen y excluye a quienes se dieron de baja.

- [ ] T024 [P] [US4] Test en rojo en `tests/unit/marketing-audiencia.test.ts`: claves nuevas de `AudienceFiltersSchema` válidas; `months` fuera de rango, listas vacías y claves desconocidas rechazadas; una audiencia guardada sin claves nuevas sigue valiendo (FR-008)
- [ ] T025 [US4] Sumar las claves a `AudienceFiltersSchema` en `src/lib/marketing/audience.ts`
- [ ] T026 [P] [US4] Test en rojo `tests/unit/marketing-historial-filtros.test.ts`: `cumpleFiltrosDeHistorial` por filtro; AND entre filtros; 10 aprobaron A, 3 con B → 7; nunca dictada no cuenta como cursó; atajo de ruta; últimos N meses por curso y por categoría; historial vacío cumple solo "no hizo" (FR-008..FR-010)
- [ ] T027 [US4] Implementar `src/lib/marketing/historial-filtros.ts` (`tieneFiltrosDeHistorial`, `cumpleFiltrosDeHistorial`, `contactosQueCumplen`)
- [ ] T028 [P] [US4] Test en rojo `tests/unit/marketing-audiencias-historial.test.ts`: `condicionDeHistorial` devuelve `IN` o `NOT IN` según DV-008; sin filtros de historial no lee historiales; combinado con filtros de la 045, `particionarAudiencia` sigue excluyendo baja, archivado y sin correo
- [ ] T029 [US4] En `src/server/marketing/audiences.ts`: `condicionDeHistorial` en `condicionesDeFiltros` (usa `historialesDeLaOrganizacion` y `rutasPorCurso`), y `categories` en `opcionesDeFiltros`
- [ ] T030 [US4] Sección "Historial de cursos" en `src/components/marketing/audience-builder.tsx` (cursó / aprobó / cursó sin aprobar / no hizo / últimos N meses por curso o categoría / siguiente paso de la ruta de un curso)

**Checkpoint**: gate verde → commit de US4.

---

## Phase 6: User Story 5 — Medir la recompra (P2)

**Goal**: pestaña Recompra en Marketing.

**Independent Test**: con un historial conocido, las tres cifras coinciden con el cálculo a mano.

- [ ] T031 [P] [US5] Test en rojo `tests/unit/marketing-recompra.test.ts`: 100 personas, 30 con dos o más → 30 %; días promedio; pares consecutivos contados por persona, top 10; el período recalcula; `periodoDeRecompra` valida fechas (FR-011)
- [ ] T032 [US5] Implementar `src/lib/marketing/recompra.ts` (`metricasDeRecompra`, `periodoDeRecompra`)
- [ ] T033 [US5] `src/server/marketing/recompra.ts` (`recompraDeLaOrganizacion`) y ruta `src/app/api/marketing/recompra/route.ts` (GET, `marketing.ver`, 422 `invalid_query`) (FR-012)
- [ ] T034 [US5] `src/components/marketing/repurchase-view.tsx` (período: últimos 12 meses / este año / todo / a medida; tres cifras y tabla de pares) y pestaña "Recompra" en `src/app/(app)/marketing/page.tsx`

**Checkpoint**: gate verde → commit de US5.

---

## Phase 7: Polish & Cross-Cutting

- [ ] T035 Guard `tests/unit/recorrido-comercial-guard.test.ts`: solo `src/lib/recorrido-comercial.ts` decide estados comerciales; el loader usa `inscripcionesNoDictadas` y `estadoDeAprobacionDeCursada`; ningún archivo nuevo lee `installment`, `payment` ni `amount`; las rutas nuevas declaran su capacidad (FR-010, FR-012, SC-003)
- [ ] T036 [P] `CLAUDE.md`: fila "Recorrido comercial" en el mapa del código; `specs/ROADMAP.md`: el ítem pasa a implementado (046)
- [ ] T037 Gate final completo y marcar todas las tareas

**Checkpoint**: gate verde → commit de cierre.

---

## Dependencies & Execution Order

- Phase 1 bloquea todo. US1 → US3 (la tarjeta crece). US2 → US3 (sugerencias usan rutas) y → US4 (atajo de ruta). US5 depende solo de Phase 1.
- Dentro de cada fase: test en rojo antes de su implementación.
