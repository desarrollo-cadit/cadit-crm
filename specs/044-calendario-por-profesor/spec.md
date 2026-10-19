# Spec 044: Calendario por profesor

**Estado**: implementado · **Fecha**: 2026-10-19

## Problema

El calendario del staff (`/calendar`) muestra todas las clases sin filtro. El
dueño quiere ver la CARGA de cada profesor: qué clases da en la semana y
cuántas horas suman.

## Requisitos

- **FR-001** Filtro de profesores (selección múltiple, "Todos" por defecto) en
  el encabezado del calendario. Incluye la opción "Sin profesor".
- **FR-002** El profesor de una clase es `class_session.teacher_id` si está
  (suplencia), si no `cohort.teacher_id` — la misma regla de alcance que el
  portal del profesor. Una clase proyectada usa el profesor de la cohorte.
- **FR-003** El filtro se aplica en el SERVIDOR: `/api/calendar?teacherIds=a,b`
  (Zod). El valor `sin-profesor` selecciona las clases sin profesor.
- **FR-004** Cada clase del DTO trae `teacherId` y `teacherName`; el bloque lo
  muestra en el `title` y, cuando hay lugar (una sola columna), en el texto.
- **FR-005** Resumen de carga de la semana visible: por profesor, cantidad de
  clases y horas (fin − inicio), separando reales y proyectadas. Las canceladas
  NO suman: se muestran aparte. Una clase sin horario cuenta como clase con
  0 h y queda señalada. Las clases que se pisan del mismo profesor suman cada
  una sus horas y se señalan como superposición.
- **FR-006** Estado en la URL: `?profesor=id1,id2`; sobrevive a la navegación
  de semanas y se puede compartir.
- **FR-007** Sin dinero: `teacher.hourly_rate` NO viaja en el DTO (restringido
  a `academico.editar`/`cobranza.ver` desde 040). La ruta sigue con
  `academico.ver` (Ventas la ve: nombres y horas no son dinero).
- **FR-008** Recesos, colores por cohorte, "Hoy" y navegación de semanas sin
  cambios.

## Decisiones

- La lista de profesores del filtro viene en la misma respuesta (`teachers`:
  solo `id` y `name`, todos los de la organización), para que el filtro no
  dependa de quién tiene clases esta semana.
- El resumen se calcula en el navegador con una función PURA
  (`src/lib/teacher-load.ts`) sobre las clases ya filtradas de la semana: es
  el mismo dato que se dibuja, así que no hay dos verdades.
- Horas con fin ≤ inicio (o sin horario) = 0 h y "sin horario"; no se inventa
  una duración.
