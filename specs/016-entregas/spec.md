# 016 — Entregas y corrección

**Estado**: decisiones cerradas (2026-09-16), sin implementar · **Depende
de**: 014, 015, 028 · **Habilita**: —

## Por qué esta fase existe

[010](../010-evaluacion-y-certificados/spec.md) registra el **resultado** de
una evaluación, pero no el **trabajo**. Hoy el alumno manda su archivo por
WhatsApp o por correo, el profesor lo busca entre veinte mensajes, corrige, y
avisa por otro canal. Nada de eso queda registrado: si el alumno reclama, no
hay fecha de entrega ni devolución escrita.

Esta fase cierra el circuito: entrega → corrección → resultado, sobre las
evaluaciones que ya existen.

## Decisión marco que la condiciona

**Los archivos NO se suben.** La entrega es un **enlace** (Drive, WeTransfer,
Autodesk Docs). Ver la decisión de archivos en el [ROADMAP](../ROADMAP.md).

Consecuencia asumida y explícita: **la descarga ocurre fuera de la
plataforma**. El profesor abre el enlace del alumno en otra pestaña. Adentro
queda el registro de qué se entregó, cuándo, y la corrección.

Esto no es lo que se pidió originalmente ("que los profesores puedan
descargarlos y corregirlos en la plataforma") y se aceptó a cambio de no
sumar cientos de gigas de archivos de Revit al VPS ni enmendar la
constitución por segunda vez.

## User Scenarios

### US1 — El alumno entrega (Priority: P1)

Como alumno quiero entregar mi trabajo pegando el enlace donde está, y ver
confirmado que quedó registrado con su fecha.

### US2 — Entrega fuera de plazo (Priority: P1)

Como profesor quiero ver claramente si una entrega llegó tarde, para decidir
si la tomo igual.

### US3 — El profesor corrige (Priority: P1)

Como profesor quiero abrir la entrega, marcar si aprueba y escribir una
devolución, y que eso alimente la evaluación de 010 sin cargarlo dos veces.

### US4 — El alumno ve su devolución (Priority: P1)

Como alumno quiero leer la devolución del profesor, porque un "no aprobado"
sin explicación no me sirve de nada.

### US5 — Reentrega (Priority: P2)

Como alumno quiero poder volver a entregar si me lo piden, conservando el
historial de lo anterior.

## Requirements

- **FR-001**: Una entrega DEBE asociarse a una evaluación
  (`assessment`) y a una inscripción.
- **FR-002**: La entrega es un ENLACE con título opcional. El sistema NO
  almacena archivos.
- **FR-003**: El enlace DEBE validarse como http(s), con el mismo criterio que
  el resto del sistema (`httpUrl`).
- **FR-004**: DEBE registrarse la fecha exacta de entrega.
- **FR-005**: La evaluación DEBE poder declarar fecha límite para toda la
  cohorte (`assessment.due_at`, instante con zona horaria). Una entrega
  posterior a la fecha vigente se marca como fuera de plazo, pero NO se
  rechaza: la decisión de aceptarla es del profesor.
- **FR-005b**: Coordinación y el profesor DEBEN poder modificar la fecha límite
  del grupo, y otorgar una prórroga individual por inscripción. La prórroga
  registra la nueva fecha, quién la otorgó y el motivo.
- **FR-005c**: La fecha vigente de un alumno es la MÁS TARDÍA entre la del
  grupo y su prórroga. Una prórroga solo puede sumar plazo: si después se
  corre la fecha del grupo más allá de ella, el alumno no queda por detrás de
  sus compañeros.
- **FR-005d**: "Fuera de plazo" se calcula contra la fecha vigente AL MOSTRAR,
  no contra la del momento de la entrega: una prórroga posterior convierte una
  entrega tardía en entrega a tiempo.
- **FR-005e**: La fecha límite se compone y se muestra con zona horaria, con el
  mismo criterio que `classInstant()` (`src/lib/schedule-time.ts`). Un
  "23:59" sin zona cierra el plazo antes de hora para los alumnos de otros
  países.
- **FR-006**: Corregir DEBE actualizar el resultado en `assessment_result`,
  sin doble carga.
- **FR-007**: La devolución escrita DEBE ser visible para el alumno.
- **FR-008**: Una reentrega NO DEBE borrar la anterior: el historial queda.
- **FR-009**: El alumno NO DEBE ver entregas de sus compañeros.
- **FR-010**: Una entrega corregida NO DEBE poder modificarse por el alumno
  sin que el profesor la reabra.
- **FR-011**: La devolución DEBE guardarse en un campo PROPIO de la entrega.
  NO se escribe en `assessment_result.notes`: ese campo hoy lo carga el staff
  como nota interna, y el FR-007 lo haría visible para el alumno.
- **FR-012**: En un programa multi-módulo (028) la entrega cuelga de la
  inscripción del MÓDULO, no de la del programa. La evaluación ya es por
  cohorte (`assessment.cohort_id`) y la cohorte de módulo es la que tiene
  profesor, clases y asistencia.
- **FR-013**: La reentrega NO tiene tope. El alumno solo puede volver a
  entregar si el profesor REABRE la entrega: el permiso es un estado de la
  entrega, no un contador.

## Decisiones (cerradas el 2026-09-16 con el dueño)

- **DV-001** ✅ **Sí**: se puede entregar sin fecha límite. No todas las
  evaluaciones tienen plazo, y sin fecha no hay "tardía" que marcar.
- **DV-002** ✅ **Automático**: corregir la entrega escribe el resultado en
  `assessment_result` en el mismo movimiento. El doble paso es la razón por
  la que hoy los datos no se cargan. El índice único de `assessment_result`
  hace que corregir SOBRESCRIBA, no que duplique.
- **DV-003** ✅ **Sin tope, y solo con reapertura del profesor** (FR-013). Un
  número fijo obliga a adivinar hoy un límite que ningún profesor pidió, y el
  día que haga falta una entrega más hay que tocar código.
- **DV-006** ✅ *(2026-09-15, decisión del dueño)*: la fecha límite NO bloquea.
  Pasada la fecha vigente, la entrega se acepta marcada como tardía y el
  profesor decide. Hay fecha del grupo modificable y prórroga individual
  (FR-005b a FR-005e).
- **DV-004** ✅ **No se verifica el enlace**. El sistema no puede autenticarse
  contra el Drive del alumno, y un chequeo que falla en falso es peor que
  ninguno. Se valida la FORMA con `httpUrl` (`src/lib/url-schema.ts`).
- **DV-005** ✅ **No se avisa, por ahora**. La 017 está fuera de alcance por
  decisión del dueño, y no se abre una dependencia nueva para esto: la entrega
  aparece en el portal del profesor y ahí la ve. Si algún día entra la 017, el
  aviso se suma sin cambiar el modelo.

## Success Criteria

- **SC-001**: Un alumno entrega y el profesor lo ve en su portal sin
  intermediarios.
- **SC-002**: Corregir la entrega actualiza el estado de aprobación del alumno
  en 010, sin carga doble.
- **SC-003**: Una entrega fuera de plazo se distingue a simple vista.
- **SC-004**: Un alumno no puede ver ni alcanzar la entrega de otro,
  verificado por test.

## Out of Scope

- Almacenamiento de archivos (decisión marco).
- Detección de plagio.
- Rúbricas de corrección por criterios.
- Notas numéricas (010 fijó aprobado/no aprobado).
