# Data model — 046 Recorrido comercial del alumno

**Plan**: [plan.md](./plan.md) · **Research**: [research.md](./research.md)

Una tabla nueva (`course_route`). El historial comercial es DERIVADO y no se
guarda.

---

## §1 `course_route` — ruta entre cursos (migración 0072)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | text PK | prefijo `crr_` (`src/lib/db/ids.ts`) |
| `organization_id` | text NOT NULL | FK `organization` `on delete cascade`; RLS `tenant_isolation` |
| `from_course_id` | text NOT NULL | FK `course` `on delete cascade` — curso de origen |
| `to_course_id` | text NOT NULL | FK `course` `on delete cascade` — curso siguiente |
| `position` | integer NOT NULL | 0, 1, 2… orden dentro del origen |
| `created_by` | text NULL | FK `user` `on delete set null` |
| `created_at` | timestamp NOT NULL default now() | |

Restricciones e índices:

- `course_route_no_self` CHECK `from_course_id <> to_course_id` (FR-005).
- `course_route_org_from_to_uq` UNIQUE (`organization_id`, `from_course_id`, `to_course_id`): sin repetidos.
- `course_route_org_from_pos_idx` (`organization_id`, `from_course_id`, `position`): leer la ruta en orden.
- RLS: `enable row level security` + `tenant_isolation` escritas a mano.

Reglas que valida el servidor (no la base): origen y siguientes son cursos de
la organización (404 / 422), ninguno es taller, a lo sumo 20 siguientes. Los
ciclos A → B → A se permiten.

Escritura: `guardarSiguientes` borra las filas del origen e inserta la lista
nueva con `position` = índice, dentro de la transacción del pedido
(reemplazo total, idempotente).

## §2 Cursada comercial (derivada)

### Entrada de la derivación — `CursadaComercial` (una por inscripción con grupo)

```ts
type CursadaComercial = {
  enrollmentId: string;
  contactId: string;
  parentEnrollmentId: string | null;
  courseId: string;
  courseName: string;
  courseKind: "curso" | "modulo" | "taller";
  categoryId: string | null;
  cohortId: string;
  cohortName: string;           // etiquetaDeCohorte
  startDate: Date;
  endDate: Date | null;
  stageKind: "open" | "won" | "lost";
  nuncaDictada: boolean;        // inscripcionesNoDictadas (cursadaNuncaDictada)
  aprobacion: "aprobado" | "reprobado" | "pendiente" | "sin_datos"; // estadoDeAprobacionDeCursada
  certificadoVigente: boolean;
};
```

El loader (`cargarCursadasComerciales`) arma estas filas; la madre de una
especialización llega con la `aprobacion` ya compuesta por
`programApprovalState` sobre sus hijas.

### Salida — `EntradaDeHistorial` (una por contacto y curso)

```ts
type EstadoComercial = "aprobo" | "curso_sin_aprobar" | "en_curso" | "por_empezar";

type EntradaDeHistorial = {
  courseId: string;
  courseName: string;
  categoryId: string | null;
  estado: EstadoComercial;      // el mejor entre sus cursadas (DV-005)
  sinResultado: boolean;        // curso_sin_aprobar sin datos cargados
  cohortId: string;             // el grupo de la cursada elegida
  cohortName: string;
  startDate: Date;
  endDate: Date | null;
  primerInicio: Date;           // la compra (métricas)
  ultimoInicioCursado: Date | null; // último grupo que empezó (filtro "últimos N meses")
  veces: number;                // cursadas contadas de ese curso
  especializacion: { modulosAprobados: number; modulosTotal: number } | null;
};
```

Orden de rango: `aprobo` (4) > `en_curso` (3) > `curso_sin_aprobar` (2) >
`por_empezar` (1); a igual rango gana el inicio más reciente. Historial de
un contacto ordenado por `startDate` descendente.

## §3 Filtros de audiencia — claves nuevas en `AudienceFiltersSchema`

Todas opcionales; `v: 1` sigue igual; listas de 1..200 ids.

| Clave | Significado (sobre el historial) |
|---|---|
| `historyTakenCourseIds` | cursó alguno de estos cursos (`aprobo` · `curso_sin_aprobar` · `en_curso`) |
| `historyApprovedCourseIds` | aprobó alguno de estos cursos |
| `historyNotApprovedCourseIds` | cursó alguno de estos sin aprobar (`curso_sin_aprobar`) |
| `historyNotDoneCourseIds` | NO hizo ninguno de estos (ningún estado, por empezar incluido) |
| `historyRecent` | `{ months: 1..120; courseIds?: lista; categoryIds?: lista }` — cursó algo (de esos cursos o categorías; sin listas = cualquier curso) que empezó en los últimos `months` meses |
| `historyNextStepOfCourseId` | atajo: cursó ese curso Y no hizo ninguno de sus siguientes |

Combinación: AND entre claves (y con los filtros de la 045), "alguno de"
dentro de cada lista.

## §4 Sugerencia — `SugerenciaDeRecompra`

```ts
type SugerenciaDeRecompra = {
  courseId: string;
  courseName: string;
  porCursos: string[];          // nombres de los cursos de origen
  proximoGrupo: { cohortId: string; name: string; startDate: string } | null;
};
```

## §5 Métricas — `MetricasDeRecompra`

```ts
type MetricasDeRecompra = {
  periodo: { desde: string | null; hasta: string | null };
  personas: number;             // con al menos una compra en el período
  recompraron: number;          // con una compra del período que no es la primera
  tasa: number;                 // 0..100, un decimal
  diasPromedioEntreCursos: number | null;
  paresMedidos: number;
  pares: { fromCourseId: string; fromName: string; toCourseId: string; toName: string; personas: number }[]; // top 10
};
```

Sin montos: ninguna de estas estructuras lleva plata.

## §6 `historical_import_batch` — una importación de historial (0073, US6)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | text PK | `hib_` |
| `organization_id` | text NOT NULL | FK cascade; RLS |
| `source_label` | text NOT NULL | "planilla 2020–2024" |
| `file_name` | text NULL | nombre del archivo subido |
| `status` | text NOT NULL | `aplicando` · `aplicada` · `deshecha` (CHECK) |
| `mapping` | jsonb NOT NULL | `{ cursos: {label: courseId o null}, vendedores: {raw: sellerId o null} }` |
| `pending_rows` | jsonb NULL | filas válidas por aplicar; NULL al terminar o deshacer |
| `total_rows`, `processed_rows`, `problem_rows` | integer NOT NULL | avance y descartadas |
| `contacts_created`, `contacts_completed`, `companies_created`, `takings_created`, `takings_existing` | integer NOT NULL default 0 | resultado acumulado |
| `imported_by`, `undone_by` | text NULL | FK user set null |
| `created_at`, `finished_at`, `undone_at` | timestamp | |

Índice `(organization_id, created_at)`.

## §7 `historical_course_taking` — una cursada histórica (0073, US6)

| Columna | Tipo | Regla |
|---|---|---|
| `id` | text PK | `hct_` |
| `organization_id` | text NOT NULL | FK cascade; RLS |
| `contact_id` | text NOT NULL | FK contact cascade |
| `course_id` | text NULL | FK course set null |
| `course_label` | text NOT NULL | nombre unificado de la planilla (siempre) |
| `original_label` | text NULL | `curso_original` |
| `taken_on` | timestamp NOT NULL | `fecha` (medianoche UTC, como `cohort.start_date`) |
| `company_id` | text NULL | FK company set null |
| `seller_id` | text NULL | FK seller set null |
| `is_student` | boolean NOT NULL default false | `estudiante = si` |
| `edition`, `note` | text NULL | |
| `source_label` | text NOT NULL | "planilla 2020–2024" |
| `source_row` | integer NULL | `fila_planilla` |
| `batch_id` | text NOT NULL | FK `historical_import_batch` cascade |
| `dedup_key` | text NOT NULL | `contactId|curso:<courseId>|AAAA-MM-DD` o `contactId|texto:<label normalizado>|AAAA-MM-DD` |
| `created_at` | timestamp | |

Índices: UNIQUE `(organization_id, dedup_key)`; `(organization_id, contact_id)`;
`(organization_id, batch_id)`.

## §8 La derivación con registros históricos

```ts
type RegistroHistorico = {
  contactId: string;
  courseId: string | null;     // null = texto
  courseLabel: string;
  courseName: string;          // nombre del catálogo, o el texto
  categoryId: string | null;
  takenOn: Date;
  edition: string | null;
};
```

`historialesComerciales(cursadas, now, historicos = [])`: cada registro da una
entrada `estado: "curso_historico"`, `courseId` = el del catálogo o
`texto:<label>`, `cohortId: null`, `cohortName` = "Edición N" o null,
`startDate = primerInicio = ultimoInicioCursado = takenOn`. Se fusiona con
las demás del mismo curso por rango (DV-012).

## §9 Tipo de contacto (US7, derivado)

```ts
type TipoDeContacto = "lead" | "alumno_activo" | "exalumno";
```

Sobre `EntradaDeHistorial` (que suma `activo: boolean`): alguna entrada
activa → `alumno_activo`; alguna `esCursado` → `exalumno`; si no (o sin
historial) → `lead`. No se guarda.

Filtro de audiencia nuevo en `AudienceFilters`:
`contactTypes?: ("lead" | "alumno_activo" | "exalumno")[]` (1..3).

## §10 Columnas nuevas (0074, US8)

| Tabla | Columna | Regla |
|---|---|---|
| `course` | `is_free` boolean NOT NULL default false | "Gratuito: no cuenta como venta" (`academico.editar`) |
| `company` | `exclude_from_reports` boolean NOT NULL default false | "Excluir de los reportes" (`empresas.editar`) |

`EntradaDeHistorial` suma `sellerId` y `companyId` de la compra (DV-022).

## §11 Reportes (US8)

```ts
type Periodo = { desde: Date | null; hastaExclusivo: Date | null };  // periodoDeRecompra
type ContextoDeReportes = {
  cursosGratuitos: ReadonlySet<string>;
  empresasExcluidas: ReadonlySet<string>;
  vendedores: ReadonlyMap<string, string>;   // id → nombre
  empresas: ReadonlyMap<string, string>;     // id → nombre
};
```

Una **compra** = una entrada del historial fechada por `primerInicio`
(como Recompra). Se descartan las de empresas excluidas en todos los
reportes, y las de cursos gratuitos en los de ventas.
