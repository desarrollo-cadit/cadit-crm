# Implementation Plan: Recorrido comercial del alumno

**Branch**: `046-recorrido-comercial` | **Fecha**: 2026-10-23 | **Spec**: [spec.md](./spec.md)

**Migración**: `drizzle/0072_rutas_entre_cursos.sql` · **Research**:
[research.md](./research.md) · **Modelo**: [data-model.md](./data-model.md) ·
**Contratos**: [contracts/](./contracts/) · **Prueba local**:
[quickstart.md](./quickstart.md)

## Summary

El sistema ya sabe qué cursó cada persona; esta funcionalidad lo usa para
vender el curso siguiente. Cuatro piezas sobre UNA sola derivación pura:

1. **Historial comercial** (`historialesComerciales`, `src/lib/recorrido-comercial.ts`):
   por contacto, un renglón por curso con su estado (aprobó · cursó sin
   aprobar · en curso · inscripto, por empezar). Recibe las cursadas ya
   marcadas con la regla de grupos que nunca se dictaron
   (`inscripcionesNoDictadas` → `cursadaNuncaDictada`) y con el estado de
   aprobación que ya calcula el legajo (`estadoDeModulo`,
   `programApprovalState`), extraído a una función compartida para que el
   legajo y el recorrido no puedan divergir.
2. **Rutas entre cursos** (tabla `course_route`, 0072): lista ordenada de
   cursos siguientes por curso, editada con `academico.editar` desde la lista
   de cursos de Académico.
3. **"Le podría interesar"** en la pestaña Seguimiento del contacto: los
   siguientes de lo que cursó, sin lo ya hecho, sin lo no publicado, con el
   próximo grupo abierto.
4. **Segmentos y métricas** en Marketing (`marketing.ver`): filtros por
   historial que se enchufan al modelo de filtros de la 045 (misma
   evaluación, mismas exclusiones de baja/archivado/sin correo/prueba) y la
   vista **Recompra** (tasa, tiempo promedio entre cursos, pares curso →
   curso siguiente), sin plata.

Ninguna dependencia nueva, ninguna capacidad nueva, una tabla nueva.

## Technical Context

**Language/Version**: TypeScript estricto (`strict` + `noUncheckedIndexedAccess`), Node 22.

**Primary Dependencies**: Next.js 15 (App Router) + React 19, Drizzle ORM, Better Auth (organization), Zod, Tailwind (tokens). **Ninguna dependencia nueva**.

**Storage**: PostgreSQL con RLS; 1 tabla nueva (`course_route`). El historial es DERIVADO: no se guarda (spec, Key Entities).

**Testing**: Vitest — unit puro con TDD rojo-primero (historial, rutas, sugerencias, filtros, métricas), servidor con dobles de base, guards estructurales (una sola derivación, capacidades, ningún dato de plata). Migración probada en un PostgreSQL descartable.

**Target Platform**: contenedor Linux (Coolify / docker compose), una instancia = un negocio.

**Project Type**: web monolito (`src/app` + `src/server` + `src/lib` + `src/components`).

**Performance Goals**: historial de un contacto < 300 ms; vista previa de audiencia con filtros de historial < 1 s y Recompra < 1 s con ~400 contactos / ~400 inscripciones / ~15 000 marcas de asistencia (research R3).

**Constraints**: la definición de "cursó" y "aprobó" vive en UN lugar (FR-010, SC-003); un dato que no se debe ver no viaja (Recompra y el historial sin montos); el portal del alumno no cambia.

**Scale/Scope**: ~340 personas con historial, decenas de cursos, decenas de rutas. 3 superficies de UI (tarjeta en Seguimiento, diálogo de rutas en Académico, pestaña Recompra) + filtros nuevos en el armador de audiencias.

## Constitution Check

*Antes de la Fase 0 y re-evaluado tras el diseño (Fase 1): **PASA**, sin violaciones.*

| Principio | Estado | Cómo se cumple |
|---|---|---|
| **I. Seguridad** | ✅ | Sin secretos nuevos. Un dato que no se debe ver no viaja: el historial y Recompra no leen `installment`, `payment` ni `enrollment.amount` (guard estructural). El historial viaja con `contactos.ver` (lo mismo que el legajo); Recompra y los filtros con `marketing.ver`; editar rutas con `academico.editar`. Contacto o curso ajeno = 404. |
| **II. Soberanía** | ✅ | Sin dependencias externas: todo se calcula con la base propia. Sin telemetría de terceros (ROADMAP, "Telemetría solo propia"). |
| **III. Multi-tenancy** | ✅ | `course_route` con `organization_id` NOT NULL, índices org-first, RLS + `tenant_isolation` escritas a mano en la 0072. Toda lectura por `scoped()` dentro de la transacción del pedido. |
| **IV. Idempotencia** | ✅ | 0072 re-ejecutable (`if not exists`, FKs/CHECK en `do $$` contra `pg_constraint`, `drop policy if exists`). Guardar rutas = reemplazo total de la lista del curso: repetir el mismo PUT deja el mismo estado. Sin webhooks nuevos. |
| **V. Calidad** | ✅ | Gate `typecheck + lint + test` por fase; TDD en lo puro. |
| **VI. Specs antes de código** | ✅ | spec aprobada (supuestos aceptados por el dueño); este plan; tareas después. |
| **VII. Trazabilidad** | ✅ | Decisiones DV-001..DV-010 abajo; las interpretaciones de la spec quedan escritas (research R1, R2, R5). |
| **VIII. Foco (1.8.0)** | ✅ | Sirve a convertir y reactivar exalumnos propios (campañas segmentadas a contactos propios, permitidas por 1.8.0) y a Ventas al atender. Sin propensión ni automatismos (fuera de alcance). |
| **IX. Verificación en vivo** | ⚠️ diferida por el dueño | El dueño decidió **no correr E2E en vivo** en esta etapa. Lo no verificado en vivo queda marcado "pendiente de verificación humana" (quickstart §4). No es una violación: el principio admite la marca explícita y la decisión es del dueño. |

## Decisiones

- **DV-001 Una sola derivación, pura.** `historialesComerciales(cursadas, now)`
  en `src/lib/recorrido-comercial.ts` decide estado, deduplicación por curso,
  especialización como una entrada y talleres afuera. La consumen la ficha,
  las sugerencias, los filtros de audiencia y Recompra. No hay versión SQL de
  la regla (research R3).
- **DV-002 Reusar, no reescribir.** La marca de "nunca se dictó" sale de
  `inscripcionesNoDictadas` (`src/server/cursadas-no-dictadas.ts`, que usa
  `cursadaNuncaDictada`). El estado de aprobación sale de una función nueva,
  `estadoDeAprobacionDeCursada` (`src/server/estado-de-cursada.ts`), EXTRAÍDA
  sin cambio de comportamiento de `armarCursada` del legajo, que pasa a
  llamarla: legajo y recorrido comparten la cuenta (research R2).
- **DV-003 Un loader para todo.** `cargarCursadasComerciales(orgId, { contactIds? })`
  trae en lote (≤ 8 consultas) las inscripciones con grupo, cursos, etapas,
  clases, asistencia, evaluaciones, resultados y certificados, y arma las
  filas de entrada de la función pura. Para un contacto filtra por
  `contact_id`; para audiencias y métricas lee toda la organización.
- **DV-004 Estados.** Por empezar = el grupo no empezó; en curso = empezó y no
  terminó; terminado → "aprobó" si la aprobación es `aprobado` o hay un
  certificado vigente; si no, "cursó sin aprobar" (con `sinResultado` cuando
  nadie cargó datos, para no acusar: se muestra "sin resultado cargado").
  Una inscripción en etapa `lost` ("abandonó") de un grupo que no empezó no
  cuenta; si el grupo ya empezó, cuenta como cursada (research R1).
- **DV-005 Recursada.** Un curso, una entrada, con el mejor estado (aprobó >
  en curso > cursó sin aprobar > por empezar); se guardan la primera y la
  última fecha de inicio cursada y cuántas veces.
- **DV-006 Rutas = reemplazo total.** `PUT /api/courses/[id]/next-courses`
  con la lista ordenada; sin autorreferencias, sin repetidos, sin talleres,
  tope 20. Los ciclos (A → B → A) se permiten (spec, Edge Cases).
- **DV-007 Filtros de historial dentro del esquema de la 045.** Se suman
  claves opcionales a `AudienceFiltersSchema` (`v: 1` sigue valiendo: las
  audiencias guardadas se leen igual). `condicionesDeFiltros` agrega UNA
  condición `IN` / `NOT IN` sobre `contact.id` calculada con la función pura;
  las exclusiones (prueba > baja > archivado > sin_correo > duplicado) no se
  tocan porque siguen en `particionarAudiencia` (research R4).
- **DV-008 "No hizo" incluye a quien no tiene historial.** Si un contacto sin
  cursadas cumple los filtros de historial (p. ej. solo "no hizo Y"), la
  condición es `NOT IN (los que tienen historial y no cumplen)`; si no, `IN
  (los que cumplen)`. Así "no hizo Y" alcanza también a leads.
- **DV-009 Recompra por fecha de inicio.** Una compra es una entrada del
  historial fechada por el primer inicio de ese curso. Período = compras que
  empiezan en el rango; recompra = compra del período que no es la primera de
  la persona (research R5).
- **DV-010 Sin capacidades nuevas.** Historial y sugerencias: `contactos.ver`.
  Rutas: leer `academico.ver`, editar `academico.editar`. Filtros y Recompra:
  `marketing.ver` (crear/guardar audiencias sigue en `marketing.enviar`).

## Project Structure

### Documentation (this feature)

```text
specs/046-recorrido-comercial/
├── spec.md
├── plan.md              # este archivo
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── contact-commercial-history.md
│   ├── course-routes.md
│   ├── audience-history-filters.md
│   └── repurchase-metrics.md
└── tasks.md
```

### Source Code

| Capa | Archivo | Qué hace |
|---|---|---|
| Migración | `drizzle/0072_rutas_entre_cursos.sql` (+ `meta/_journal.json`, `meta/0072_snapshot.json`) | Tabla `course_route`, índices, CHECK, RLS a mano |
| Esquema | `src/lib/db/schema.ts` · `src/lib/db/ids.ts` | `courseRoute`, prefijo `crr` |
| Puro | `src/lib/recorrido-comercial.ts` | `historialesComerciales`, estados, rangos, `esCursado` |
| Puro | `src/lib/rutas-de-cursos.ts` | `validarSiguientes`, `sugerenciasDeRecompra`, `proximoGrupoAbierto` |
| Puro | `src/lib/marketing/historial-filtros.ts` | `tieneFiltrosDeHistorial`, `cumpleFiltrosDeHistorial` |
| Puro | `src/lib/marketing/audience.ts` | Claves nuevas en `AudienceFiltersSchema` |
| Puro | `src/lib/marketing/recompra.ts` | `metricasDeRecompra`, `periodoDeRecompra` |
| Servidor | `src/server/estado-de-cursada.ts` | `estadoDeAprobacionDeCursada` (extraída del legajo) |
| Servidor | `src/server/student-record.ts` | `armarCursada` llama a la función extraída (sin cambio de comportamiento) |
| Servidor | `src/server/recorrido-comercial.ts` | `cargarCursadasComerciales`, `historialesDeLaOrganizacion`, `recorridoComercialDelContacto` |
| Servidor | `src/server/course-routes.ts` | `listarRutas`, `guardarSiguientes`, `rutasPorCurso` |
| Servidor | `src/server/marketing/audiences.ts` | `condicionesDeFiltros` suma la condición de historial; `opcionesDeFiltros` suma `categories` |
| Servidor | `src/server/marketing/recompra.ts` | `recompraDeLaOrganizacion` |
| Rutas | `src/app/api/contacts/[id]/recorrido-comercial/route.ts` | GET (`contactos.ver`) |
| Rutas | `src/app/api/course-routes/route.ts` · `src/app/api/courses/[id]/next-courses/route.ts` | GET (`academico.ver`) · PUT (`academico.editar`) |
| Rutas | `src/app/api/marketing/recompra/route.ts` | GET (`marketing.ver`) |
| UI | `src/components/contacts/recorrido-comercial-card.tsx` + `seguimiento-client.tsx` | Historial y "Le podría interesar" |
| UI | `src/components/academic/next-courses-dialog.tsx` + `academic-client.tsx` | "Siguen: …" en la lista y el diálogo de edición |
| UI | `src/components/marketing/audience-builder.tsx` | Sección "Historial de cursos" |
| UI | `src/components/marketing/repurchase-view.tsx` + `src/app/(app)/marketing/page.tsx` | Pestaña "Recompra" |
| Docs | `CLAUDE.md` · `specs/ROADMAP.md` | Fila del mapa del código; estado del ítem |

### Tests

| Archivo | Qué fija |
|---|---|
| `tests/unit/recorrido-comercial.test.ts` | Estados, nunca dictada afuera, especialización una vez con módulos aprobados, talleres afuera, recursada con mejor estado, abandonó, certificado = aprobó, `sinResultado` |
| `tests/unit/estado-de-cursada.test.ts` | La función extraída devuelve lo mismo que el legajo (asistencia nula ≠ 0, dispensa, `sin_datos`) |
| `tests/unit/rutas-de-cursos.test.ts` | Validación de rutas; sugerencias (orden, sin repetidos, sin hechos ni inscriptos, sin no publicados, sin cursos sin historial); próximo grupo |
| `tests/unit/course-routes-servidor.test.ts` | Reemplazo total en orden, 404 curso ajeno, 422 autorreferencia |
| `tests/unit/marketing-historial-filtros.test.ts` | Cada filtro, combinación AND, "aprobó A y no hizo B" (7 de 10), atajo de ruta, últimos N meses por curso/categoría, nunca dictada no cuenta |
| `tests/unit/marketing-audiencia.test.ts` (ampliado) | Esquema: claves nuevas válidas, inválidas rechazadas, audiencias viejas siguen pasando |
| `tests/unit/marketing-audiencias-historial.test.ts` | `condicionesDeFiltros` con historial: IN/NOT IN, se combina con los filtros existentes, y las exclusiones de `particionarAudiencia` siguen aplicando |
| `tests/unit/marketing-recompra.test.ts` | Tasa 30/100, tiempo promedio, pares, período |
| `tests/unit/recorrido-comercial-guard.test.ts` | Una sola derivación (nadie más llama a `cursadaNuncaDictada` para esto ni re-implementa estados); sin plata; capacidades de las rutas nuevas |
| `tests/unit/migracion-rutas.test.ts` | 0072: `if not exists`, RLS, CHECK, FKs en `do $$` |
| Ajustados | `route-capabilities` (rutas nuevas declaran capacidad), `rls-cobertura` (tabla nueva), `student-record` (sin cambios de comportamiento) |

**Structure Decision**: monolito existente. Lo puro en `src/lib/`
(`recorrido-comercial.ts`, `rutas-de-cursos.ts`, y lo de marketing en
`src/lib/marketing/`), la lectura en `src/server/`, igual que 043 y 045.

## Entrega por fases

Cada fase termina con `pnpm typecheck && pnpm lint && pnpm test` en verde y un
commit convencional.

| Fase | Historias | Contenido |
|---|---|---|
| **F1 Fundación** | — | 0072 + esquema; `estado-de-cursada` extraída; derivación pura; loader |
| **F2 Historial** | US1 (P1) | Ruta del contacto + tarjeta en Seguimiento |
| **F3 Rutas** | US2 (P1) | Servidor, rutas API, diálogo en Académico |
| **F4 Sugerencias** | US3 (P1) | Pura + servidor + "Le podría interesar" |
| **F5 Segmentos** | US4 (P1) | Filtros de historial en audiencias + atajo de ruta |
| **F6 Recompra** | US5 (P2) | Métricas puras + ruta + pestaña |
| **F7 Cierre** | — | CLAUDE.md, ROADMAP, guard estructural final |

## Riesgos y preguntas abiertas

- **R-01 — Costo de leer toda la organización.** Los filtros de historial y
  Recompra leen inscripciones, asistencia y resultados de toda la
  organización por pedido. Con los volúmenes de hoy (~400 inscripciones) es
  barato; si crece 10×, se cachea por pedido o se pasa a SQL (research R3).
- **R-02 — "Cursó sin aprobar" con datos incompletos.** Un grupo terminado sin
  evaluaciones ni asistencia cargadas queda "cursó sin aprobar · sin
  resultado cargado". El filtro "cursó sin aprobar" lo incluye. Si el dueño
  prefiere excluirlo del filtro, es un cambio de una línea en
  `cumpleFiltrosDeHistorial`.
- **R-03 — Sin E2E en vivo** (decisión del dueño): la UI queda "pendiente de
  verificación humana" (quickstart §4).

## Complexity Tracking

Sin violaciones de la constitución: no aplica.

## Verificación

- Unit (Vitest) con TDD rojo-primero en lo puro; servidor con dobles.
- PostgreSQL descartable: migraciones 0000→0072, 0072 dos veces sin error,
  RLS habilitada con `tenant_isolation` en `course_route`, CHECK de
  autorreferencia rechaza una fila.
- Gate: `pnpm typecheck && pnpm lint && pnpm test` por fase.
- Pendiente de verificación humana: las tres pantallas (quickstart §4).

---

## Ampliación US6 — Importar el historial 2020–2024 (2026-10-23)

Historia nueva aprobada por el dueño. **Migración**:
`drizzle/0073_historial_importado.sql`. **Contrato**:
[contracts/historical-import.md](./contracts/historical-import.md).
**Modelo**: [data-model §6–§8](./data-model.md).

### Summary

Dirección sube el CSV limpio de la planilla 2020–2024 desde Ajustes →
Importar historial. Tres pasos: asociar cursos y vendedores, vista previa
(sin escribir), confirmar (por tandas, retomable). Cada fila se vuelve una
**cursada histórica** (`historical_course_taking`): no se inventan grupos ni
inscripciones. La derivación única (`historialesComerciales`) las cuenta como
`curso_historico`.

### Constitution Check (US6)

| Principio | Estado | Cómo se cumple |
|---|---|---|
| I. Seguridad | ✅ | Capacidad nueva `historial.importar`, solo Dirección. La planilla viaja solo al servidor de la instancia; las filas pendientes se guardan en la importación y se BORRAN al terminar o deshacer. Los tests usan una planilla inventada (`tests/fixtures/historial-planilla.csv`), nunca la real. |
| II. Soberanía | ✅ | Sin servicios externos ni dependencias nuevas: lector CSV propio. |
| III. Multi-tenancy | ✅ | Dos tablas con `organization_id` NOT NULL, índices org-first, RLS + `tenant_isolation` a mano en la 0073. Cada tanda corre en la transacción del pedido. |
| IV. Idempotencia | ✅ | `dedup_key` único por organización (contacto + curso o texto + fecha) e `on conflict do nothing`; tandas retomables por `processed_rows`; contactos reconocidos por correo/teléfono antes de crear; empresas por nombre. 0073 re-ejecutable. |
| V. Calidad | ✅ | TDD en lo puro: lector CSV, filas, sugerencias, plan (el MISMO para vista previa y aplicación). |
| VII. Trazabilidad | ✅ | Cada importación guarda quién, cuándo, archivo, asociaciones y resultado; cada cursada histórica su fila de planilla y su importación. |
| VIII. Foco | ✅ | Contactos propios (exalumnos). |
| IX. En vivo | ⚠️ diferida por el dueño | Sin E2E en vivo; quickstart §5 lista la verificación humana. |

### Decisiones

- **DV-011 Tabla propia, sin grupos falsos.** `historical_course_taking` con
  `course_id` (catálogo) o solo `course_label` (texto). La derivación las
  recibe aparte de las cursadas reales y les asigna `curso_historico`.
- **DV-012 Rango del estado histórico.** `aprobo` > `en_curso` >
  `curso_sin_aprobar` > `curso_historico` > `por_empezar`: un dato real del
  mismo curso gana. `curso_historico` es "cursado" (`esCursado`) pero nunca
  "aprobó" ni "cursó sin aprobar".
- **DV-013 Un plan puro para vista previa y aplicación.**
  `planDeImportacion(filas, mapeo, estado)` decide por fila: contacto
  (existente por correo, si no por teléfono, si no nuevo), qué campos vacíos
  completa, empresa (`buscarEmpresaPorNombre` o nueva) y si la cursada es
  nueva o ya estaba. La vista previa lo corre sobre todas las filas; cada
  tanda sobre sus filas con el estado de la base en ese momento.
- **DV-014 Completa, nunca pisa.** Apellido, correo, teléfono, empresa y
  origen solo si están vacíos. El correo o el teléfono no se completan si ya
  son de otro contacto; con identidad provisional (`sinwa:`), el teléfono
  pasa a ser la identidad (`planDeTelefono`).
- **DV-015 Tandas guardadas en la importación.** Confirmar valida y guarda las
  filas válidas y el mapeo en `historical_import_batch.pending_rows`;
  `POST …/aplicar` procesa 300 filas por pedido (≈ 10 pedidos), cada uno en su
  transacción. Al terminar, `pending_rows` se vacía. Si se corta, "Continuar".
- **DV-016 Deshacer = borrar sus cursadas.** Contactos y empresas creados
  quedan. Las cursadas de otra importación no se tocan.
- **DV-017 Sugerencias.** Curso: nombre igual sin tildes ni mayúsculas.
  Vendedor: nombre igual, o iniciales del nombre (CP = "Cristina Pérez")
  cuando un único vendedor las tiene.

- **DV-018 Correo mal escrito.** Un correo que no es válido no se adivina. Si la fila
  tiene teléfono, se importa SIN correo y queda como aviso (la persona se reconoce
  por el teléfono); sin teléfono, la fila es un problema. Con la planilla real:
  88 correos inválidos, 87 con teléfono.

### Source Code (US6)

| Capa | Archivo |
|---|---|
| Migración | `drizzle/0073_historial_importado.sql` (+ journal, snapshot) |
| Esquema | `src/lib/db/schema.ts` (`historicalImportBatch`, `historicalCourseTaking`) · `src/lib/db/ids.ts` (`hib`, `hct`) |
| Capacidad | `src/lib/capabilities.ts` · `src/lib/guia.ts` · `src/components/settings/roles-client.tsx` · `src/lib/nav.ts` |
| Puro | `src/lib/historial-import/csv.ts` · `planilla.ts` · `plan.ts` |
| Derivación | `src/lib/recorrido-comercial.ts` (`RegistroHistorico`, `curso_historico`) |
| Servidor | `src/server/recorrido-comercial.ts` (lee las históricas) · `src/server/historial-import.ts` |
| Rutas | `src/app/api/historial/importaciones/{route.ts,analizar,vista-previa,[id],[id]/aplicar}` |
| UI | `src/app/(app)/settings/historial/page.tsx` · `src/components/settings/historial-import-client.tsx` · insignia en `recorrido-comercial-card.tsx` |

### Entrega por fases (US6)

| Fase | Contenido |
|---|---|
| **F8 Datos y derivación** | 0073, esquema, capacidad, `curso_historico` en la derivación y el loader, insignia en la ficha |
| **F9 Importador** | CSV, filas, sugerencias, plan, servidor y rutas |
| **F10 Pantalla** | Ajustes → Importar historial (tres pasos, continuar, deshacer) |

---

## Ampliación US7 y US8 — Tipo de contacto y Reportes (2026-10-23)

Historias nuevas aprobadas por el dueño. **Migración**:
`drizzle/0074_reportes.sql` (`course.is_free`, `company.exclude_from_reports`,
`reportes.ver` a Dirección y Coordinación). **Contratos**:
[contracts/contact-type.md](./contracts/contact-type.md) ·
[contracts/reports.md](./contracts/reports.md). **Modelo**: [data-model §9–§11](./data-model.md).

### Constitution Check (US7, US8)

| Principio | Estado | Cómo se cumple |
|---|---|---|
| I. Seguridad | ✅ | `reportes.ver` nueva (Dirección y Coordinación). Los ingresos se consultan solo con `cobranza.ver` además: sin ella la clave no existe en la respuesta. Ningún reporte lleva nombres de personas. |
| II. Soberanía | ✅ | Recharts ya es dependencia; sin servicios nuevos. |
| III. Multi-tenancy | ✅ | Dos columnas nuevas en tablas que ya tienen RLS; lecturas con `scoped()`. |
| IV. Idempotencia | ✅ | 0074 re-ejecutable (`add column if not exists`, capacidades con `where not (… @> …)`). |
| V. Calidad | ✅ | TDD en `tipoDeContacto` y en cada agregación pura de `src/lib/reportes.ts`. |
| VII. Trazabilidad | ✅ | DV-019..DV-024. |
| IX. En vivo | ⚠️ diferida por el dueño | Pantallas en quickstart §6 como verificación humana. |

### Decisiones

- **DV-019 Tipo derivado en la derivación única.** La entrada del historial
  suma `activo` (alguna cursada de ese curso está en curso o por empezar, OR
  al fusionar). `tipoDeContacto(historial)` en `src/lib/recorrido-comercial.ts`:
  activo → `alumno_activo`; alguna cursada (`esCursado`) → `exalumno`; si no,
  `lead`. Un contacto sin historial es lead.
- **DV-020 Filtro de Contactos por conjuntos.** El servidor arma los
  historiales de la organización una vez, saca los ids de alumnos activos y
  de exalumnos, y filtra con `IN` (o `NOT IN` ambos para leads), así la
  paginación y la búsqueda siguen en SQL. Las cantidades por tipo se cuentan
  con la misma búsqueda y el mismo filtro de archivados.
- **DV-021 Audiencias.** `contactTypes` es un filtro de historial más: entra
  por `cumpleFiltrosDeHistorial` y `condicionDeHistorial` (lead se expresa
  como exclusión, igual que "no hizo").
- **DV-022 Ventas en la entrada del historial.** La entrada suma `sellerId` y
  `companyId` de la compra (la cursada que fija `primerInicio`): de la
  inscripción (madre) o de la cursada histórica. Gratuito y empresa excluida
  se aplican en las agregaciones con conjuntos de ids (`cursosGratuitos`,
  `empresasExcluidas`), no en la derivación.
- **DV-023 Una ruta agregada.** `GET /api/dashboard/reportes?desde&hasta`
  devuelve todos los reportes en un viaje (la derivación se lee una vez). Las
  agregaciones son puras (`src/lib/reportes.ts`). Ingresos: una consulta
  aparte de pagos (no anulados, por fecha de pago y moneda) solo con
  `cobranza.ver`.
- **DV-024 Embudo por origen.** El origen sale de `contact.source`:
  `formulario:Taller …` → Taller; `formulario:<nombre>` → Formulario
  <nombre>; `whatsapp` → WhatsApp; `importacion:…` → Importación; vacío u
  otro → Carga manual. Leads = contactos creados en el período; inscriptos =
  los que tienen alguna cursada (tipo ≠ lead). Las cursadas históricas de una
  importación cuentan como inscriptos de "Importación".

### Source Code (US7, US8)

| Capa | Archivo |
|---|---|
| Migración | `drizzle/0074_reportes.sql` (+ journal, snapshot) |
| Esquema | `course.isFree`, `company.excludeFromReports` |
| Capacidad | `reportes.ver` en `capabilities.ts` (`SYSTEM_ROLES`: Dirección y Coordinación), `guia.ts`, `roles-client.tsx` |
| Derivación | `src/lib/recorrido-comercial.ts` (`activo`, `sellerId`, `companyId`, `tipoDeContacto`) |
| Contactos | `src/app/api/contacts/route.ts` (`tipo`, cantidades) · `src/server/contact-types.ts` · `src/components/contacts/contacts-client.tsx` |
| Audiencias | `src/lib/marketing/audience.ts` (`contactTypes`) · `historial-filtros.ts` · `audience-builder.tsx` |
| Puro | `src/lib/reportes.ts` |
| Servidor | `src/server/reportes.ts` · `src/app/api/dashboard/reportes/route.ts` |
| UI | `src/components/dashboard/reports-panel.tsx` · `src/app/(app)/page.tsx` · casilla "Gratuito" en `course-form.tsx` · "Excluir de los reportes" en el formulario de empresa |

### Entrega por fases

| Fase | Contenido |
|---|---|
| **F11 Tipo de contacto** | Derivación, Contactos (pestañas, insignia), filtro de audiencias |
| **F12 Datos de reportes** | 0074, capacidad, banderas Gratuito / Excluir con su edición, venta en la derivación |
| **F13 Agregaciones** | `src/lib/reportes.ts`, `src/server/reportes.ts`, ruta |
| **F14 Pantalla** | Sección Reportes del inicio (Recharts), CLAUDE.md |
