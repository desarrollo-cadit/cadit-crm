# 016 — Entregas y corrección

**Estado**: propuesta · **Depende de**: 014, 015 · **Habilita**: —

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
- **FR-005**: La evaluación DEBE poder declarar fecha límite. Una entrega
  posterior se marca como fuera de plazo, pero NO se rechaza: la decisión de
  aceptarla es del profesor.
- **FR-006**: Corregir DEBE actualizar el resultado en `assessment_result`,
  sin doble carga.
- **FR-007**: La devolución escrita DEBE ser visible para el alumno.
- **FR-008**: Una reentrega NO DEBE borrar la anterior: el historial queda.
- **FR-009**: El alumno NO DEBE ver entregas de sus compañeros.
- **FR-010**: Una entrega corregida NO DEBE poder modificarse por el alumno
  sin que el profesor la reabra.

## Decisiones a verificar

- **DV-001**: ¿Se puede entregar sin fecha límite definida? *(propuesta: sí —
  no todas las evaluaciones tienen plazo.)*
- **DV-002**: ¿La corrección de una entrega marca automáticamente el
  resultado, o el profesor lo confirma aparte? *(propuesta: automático — el
  doble paso es la razón por la que hoy los datos no se cargan.)*
- **DV-003**: ¿Cuántas reentregas se permiten?
- **DV-004**: ¿El sistema verifica que el enlace sea accesible? *(propuesta:
  no — no puede autenticarse contra el Drive del alumno, y un chequeo que
  falla en falso es peor que ninguno.)*
- **DV-005**: ¿Se avisa al profesor cuando llega una entrega? Depende de 017.

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
