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
