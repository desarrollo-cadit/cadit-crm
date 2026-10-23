# Research — 046 Recorrido comercial del alumno

**Spec**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Fecha**: 2026-10-23

Formato: Qué hay hoy / Decisión / Motivo / Alternativas descartadas. Las rutas
de archivo son de la rama `046-recorrido-comercial`.

---

## R1 — Qué es "cursó", "aprobó", "en curso" y "por empezar"

**Qué hay hoy**

- `src/server/student-record.ts` (`getStudentRecord`): el legajo lista toda
  inscripción con grupo, sin talleres (`cursoNoEsTaller`), agrupa las hijas
  bajo la madre (especialización = una fila) y decide la aprobación con
  `estadoDeModulo` (cursada) y `programApprovalState` (madre). Tiene
  `sin_datos` para no afirmar "aprobado" sin un solo dato.
- `src/lib/cohort-status.ts` — `computeCohortStatus(start, end, now)`:
  planificada / en_curso / finalizada.
- `src/lib/cursadas-no-dictadas.ts` + `src/server/cursadas-no-dictadas.ts` —
  `inscripcionesNoDictadas(org, filas)` devuelve las inscripciones de grupos
  que nunca salieron (sin confirmar, terminados, sin actividad), arrastrando
  a las hijas. Lo usa el portal del alumno.
- Etapas (`src/server/seed/academic-stages.ts`): `finalizado` (won) y
  `abandonó` (lost) también se usan dentro de los tableros de grupo.

**Decisión** — por inscripción (antes de agrupar por curso):

| Situación | Estado comercial |
|---|---|
| Sin grupo (lead general), taller, o grupo que nunca se dictó | no cuenta |
| Etapa `lost` y el grupo todavía no empezó | no cuenta (se cayó antes de empezar) |
| Grupo `planificada` | `por_empezar` ("inscripto, por empezar") |
| Grupo `en_curso` y etapa no `lost` | `en_curso` |
| Grupo `en_curso` y etapa `lost` | `curso_sin_aprobar` (abandonó a mitad) |
| Grupo `finalizada`, aprobación `aprobado` o certificado vigente | `aprobo` |
| Grupo `finalizada`, cualquier otro | `curso_sin_aprobar` (+ `sinResultado` si la aprobación es `sin_datos`) |

"Cursó" (para filtros y sugerencias) = `aprobo`, `curso_sin_aprobar` o
`en_curso`: empezó en un grupo que se dictó (spec, Assumptions). "Hizo" (para
"no hizo Y" y para descartar sugerencias) = cualquier estado, incluido
`por_empezar`.

**Motivo**: la spec define los cuatro estados y que lo no dictado no cuenta.
El certificado vigente cuenta como aprobó porque hay cursos viejos con
certificado y sin datos cargados: decir "cursó sin aprobar" de alguien con
certificado sería falso. `sinResultado` evita la acusación cuando nadie cargó
nada (mismo criterio que `sin_datos` del legajo).

**Alternativas descartadas**: un quinto estado "terminó, sin resultado" (la
spec fija cuatro; se resuelve con la bandera y el rótulo); usar la etapa
`finalizado` como "aprobó" (la etapa la mueve Ventas a mano y no es la regla
de aprobación).

## R2 — Reusar la regla de aprobación sin copiarla

**Qué hay hoy**: el cálculo por cursada vive dentro de `armarCursada`
(closure de `getStudentRecord`, ~60 líneas): porcentaje de asistencia con
`attendancePercentage` (null si no hay marcas), mínimo con
`resolveMinAttendance`, resultados obligatorios, dispensa con
`dispensaDeInscripcion`, y `estadoDeModulo`.

**Decisión**: extraer ese cálculo, sin cambiar una línea de su lógica, a
`estadoDeAprobacionDeCursada(entrada, piezas)` en
`src/server/estado-de-cursada.ts`. Recibe las piezas YA filtradas para la
inscripción (clases del grupo, marcas de la persona, evaluaciones del grupo,
resultados de la persona), así el legajo filtra como siempre y el loader del
recorrido indexa por mapas. El legajo pasa a llamarla; `student-record.test.ts`
fija que no cambió nada. La madre de una especialización se compone con
`programApprovalState` sobre los estados de sus hijas, igual que el legajo.

**Motivo**: FR-010 y el pedido explícito ("reusar el estado de aprobación, no
re-implementarlo"). Con la función compartida, el legajo y el recorrido no
pueden decir cosas distintas de la misma persona.

**Alternativas descartadas**: llamar a `getStudentRecord` por contacto desde
las audiencias (N×8 consultas: 340 contactos = 2 700 consultas por vista
previa); copiar el cálculo (dos reglas que divergen con el primer cambio).

## R3 — Rendimiento: derivación en TypeScript sobre lectura en lote

**Qué hay hoy**: ~340 personas con historial, ~400 inscripciones (comentarios
de `schema.ts`: "las 384 filas de hoy"), del orden de 15 000 marcas de
asistencia. La vista previa de audiencias de la 045 arma `EXISTS` con Drizzle
y particiona en memoria.

**Decisión**: el loader lee en lote, con `scoped()`, ≤ 8 consultas por pedido
(inscripciones+grupo+curso+etapa, clases con `tomada`, asistencia — solo
`enrollment_id`, `class_session_id`, `status` —, evaluaciones, resultados,
certificados, y las de `inscripcionesNoDictadas` solo si hay candidatas) y
la función pura deriva. Para un contacto se filtra por `contact_id`. Las
audiencias convierten el resultado en UNA condición `IN`/`NOT IN` sobre
`contact.id`, y el resto de la consulta de la 045 sigue igual.

**Motivo**: la regla (aprobación con asistencia, dispensa, especialización,
nunca dictada) es demasiado rica para replicarla en SQL sin crear una segunda
definición, que es exactamente lo que FR-010 y SC-003 prohíben. Con estos
volúmenes, ~15 000 filas cortas por pedido se leen en decenas de ms; los
índices org-first existentes (`attendance`, `enrollment_org_cohort_idx`)
alcanzan. Solo se paga cuando hay filtros de historial.

**Alternativas descartadas**: vista materializada (hay que mantenerla viva y
es otra definición); SQL con CTEs que re-implementen la aprobación (dos
verdades); cachear entre pedidos (la ficha tiene que mostrar el cambio de hoy).

**Límite conocido** (plan R-01): si la organización crece 10×, primero se
acota la lectura de asistencia a grupos terminados; después se evalúa SQL.

## R4 — Enchufar los filtros al modelo de audiencias de la 045

**Qué hay hoy**: `AudienceFiltersSchema` (`src/lib/marketing/audience.ts`) es
`.strict()` y `v: 1`; `condicionesDeFiltros` (`src/server/marketing/audiences.ts`)
arma un `SQL[]` en AND; `candidatosDeAudiencia` es la única lectura de
`contact` (guard `marketing-guard.test.ts`); las exclusiones viven en
`particionarAudiencia`.

**Decisión**: claves opcionales nuevas en el mismo esquema (detalle en
[data-model §3](./data-model.md)); una función pura
`cumpleFiltrosDeHistorial(historial, filtros, contexto)`; en
`condicionesDeFiltros`, si hay filtros de historial, se cargan los
historiales de la organización y se agrega:

- `contact.id IN (quienes cumplen)` si un historial vacío NO cumple;
- `contact.id NOT IN (quienes tienen historial y no cumplen)` si un
  historial vacío SÍ cumple (p. ej. solo "no hizo Y").

**Motivo**: la condición es una más en el AND; todo lo que la 045 garantiza
(prueba, baja, archivado, sin correo, duplicados, tope, congelar al
confirmar) sigue pasando por el mismo camino sin tocarlo. `v: 1` sigue
siendo válido porque las claves son opcionales: ninguna audiencia guardada
cambia de significado.

**Alternativas descartadas**: `v: 2` (obliga a migrar las audiencias
guardadas sin ganar nada); un endpoint de audiencias aparte para historial
(dos caminos que arman destinatarios: lo que el guard prohíbe).

## R5 — Métricas de recompra

**Decisión**: sobre los mismos historiales (todos los estados que cuentan,
por empezar incluido: es una compra).

- **Compra** = una entrada del historial, fechada por el primer inicio de ese
  curso (`primerInicio`). Orden de compras de una persona: por fecha, y a
  igual fecha por nombre de curso (determinista).
- **Período** `[desde, hasta]` (días, zona de la organización): compras cuyo
  `primerInicio` cae adentro. Sin período = todo.
- **Personas** = con al menos una compra en el período.
- **Recompraron** = con una compra en el período que no es su primera.
- **Tasa** = recompraron / personas (0 si no hay personas). Sin período, es
  exactamente "personas con dos o más cursos / personas con al menos uno"
  (escenario US5-1: 30/100 = 30 %).
- **Tiempo promedio entre cursos** = promedio, en días, entre compras
  consecutivas de una persona, para los pares cuya segunda compra cae en el
  período. `null` si no hay pares.
- **Pares** curso → curso siguiente = pares consecutivos anteriores, contados
  por persona, los 10 más frecuentes.

**Motivo**: definiciones que coinciden con el cálculo a mano (spec,
Independent Test) y que no cuentan dos veces a la misma persona.

**Alternativas descartadas**: fechar por `enrolled_at` (está vacío en muchas
filas viejas); contar pares no consecutivos (infla los cursos de base).

## R6 — Dónde se ven y se editan las cosas

- **Historial y sugerencias**: en la pestaña Seguimiento del contacto, arriba
  de todo, porque es la pestaña de Ventas (spec US3) y la ficha ES el legajo
  (`/contacts/[id]` redirige). Ruta propia
  `GET /api/contacts/[id]/recorrido-comercial` con `contactos.ver`, para no
  engordar el DTO de Seguimiento ni acoplar sus tiempos.
- **Rutas**: la "ficha del curso en Académico" es la fila de la lista de
  cursos (el editor es un modal grande con autoguardado de temario). Se suma
  "Siguen: …" a la fila (lectura, `academico.ver`) y un botón "Cursos
  siguientes" (con `academico.editar`) que abre un diálogo propio con su PUT.
  Separado del PATCH del curso para no mezclar el reemplazo total del temario
  con el de las rutas.
- **Recompra**: tercera pestaña de `/marketing`, misma puerta `marketing.ver`.
