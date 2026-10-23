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
