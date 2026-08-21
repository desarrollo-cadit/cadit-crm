# Feature Specification: Clases y asistencia

**Feature Branch**: `009-clases-y-asistencia`

**Created**: 2026-08-21

**Status**: Draft

**Input**: La camada declara sus días y horarios como texto
(`cohort.frequency`, `days_of_week`, `start_time`, `end_time`), pero **la clase
como entidad no existe**. Sin clase no hay asistencia, no hay reposición, no
hay registro de que el profesor faltó y no hay horas dictadas. Consecuencia
directa: `teacher.hourly_rate` existe desde el ciclo 005 y no hay nada en el
sistema que multiplicar por él.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Generar el cronograma de clases de una camada (Priority: P1) 🎯 MVP

Como coordinación, cuando armo una camada necesito que el sistema genere sus
clases concretas a partir de las fechas y días declarados, para tener contra
qué tomar asistencia.

**Why this priority**: Es la entidad que falta. Todo lo demás cuelga de acá.

**Independent Test**: Crear una camada del 2 de marzo al 30 de abril, lunes y
miércoles de 18:30 a 20:30, y verificar que se generan las clases de esos días
—y solo esos— con su horario.

**Acceptance Scenarios**:

1. **Given** una camada con fecha de inicio, fin y días de la semana, **When**
   coordinación genera el cronograma, **Then** queda una clase por cada día
   correspondiente en el rango, con su horario.
2. **Given** un cronograma generado, **When** coordinación agrega una clase
   fuera de la grilla (una recuperación un sábado), **Then** queda registrada
   igual que las demás.
3. **Given** una clase programada, **When** se cancela indicando motivo,
   **Then** queda como cancelada —no se borra— y puede reprogramarse a otra
   fecha dejando el vínculo entre ambas.
4. **Given** una camada sin días declarados, **When** se intenta generar el
   cronograma, **Then** el sistema lo explica en vez de generar una clase por
   cada día del rango, fines de semana incluidos.

---

### User Story 2 - Tomar asistencia (Priority: P1)

Como coordinación (o el profesor, cuando tenga acceso), necesito marcar quién
vino a cada clase.

**Why this priority**: Es el dato que hoy no existe en ningún lado y que
habilita el criterio de aprobación por presencia de la 010.

**Independent Test**: Tomar asistencia de una clase con 10 inscriptos
marcando 8 presentes y 2 ausentes, y verificar que el porcentaje de asistencia
de la camada y de cada alumno queda actualizado.

**Acceptance Scenarios**:

1. **Given** una clase dictada, **When** se toma asistencia, **Then** cada
   inscripto queda con su estado: presente, ausente, tarde o justificada.
2. **Given** asistencia ya tomada, **When** se corrige un estado, **Then**
   queda registrado quién lo cambió y cuándo.
3. **Given** un alumno inscripto después de que la camada arrancó, **When** se
   consulta su asistencia, **Then** las clases anteriores a su inscripción NO
   cuentan como ausencias.
4. **Given** una clase cancelada, **When** se calcula el porcentaje de
   asistencia, **Then** esa clase NO se cuenta en el denominador.

---

### User Story 3 - Alumnos en riesgo por inasistencia (Priority: P2)

Como coordinación, necesito ver quiénes están por debajo del mínimo de
asistencia, para poder llamarlos antes de que sea tarde.

**Independent Test**: Con un alumno al 50% en una camada que exige 75%,
verificar que aparece en la vista de riesgo.

**Acceptance Scenarios**:

1. **Given** un mínimo de asistencia configurado, **When** un alumno queda por
   debajo, **Then** aparece en la vista de riesgo con su porcentaje y cuántas
   clases le quedan para recuperarlo.
2. **Given** un alumno en riesgo, **When** vuelve a asistir y supera el
   mínimo, **Then** sale de la vista solo.

---

### User Story 4 - Horas dictadas por profesor (Priority: P2)

Como administración, necesito saber cuántas horas dictó cada profesor en un
período, para liquidarle.

**Why this priority**: Le da sentido a `teacher.hourly_rate`, que hoy es un
campo huérfano.

**Independent Test**: Con un profesor que dictó 8 clases de 2 horas en marzo y
tiene una tarifa cargada, verificar que el total de horas y el importe son
correctos.

**Acceptance Scenarios**:

1. **Given** clases marcadas como dictadas, **When** se consulta el período de
   un profesor, **Then** se ven las horas totales y, si tiene tarifa, el
   importe.
2. **Given** una clase con suplente, **When** se calculan las horas, **Then**
   se le acreditan a QUIEN LA DICTÓ, no al titular de la camada.
3. **Given** una clase cancelada, **When** se calculan las horas, **Then** no
   suma.

---

## Requirements *(mandatory)*

- **FR-001**: El sistema DEBE generar las clases de una camada a partir de su
  rango de fechas y días de la semana.
- **FR-002**: El sistema DEBE permitir agregar, cancelar y reprogramar clases
  sueltas. Una clase cancelada NUNCA se borra.
- **FR-003**: El sistema DEBE registrar asistencia por alumno y por clase, con
  estado presente/ausente/tarde/justificada.
- **FR-004**: El porcentaje de asistencia NO DEBE contar las clases canceladas
  ni las anteriores a la inscripción del alumno.
- **FR-005**: Cada clase DEBE poder tener un profesor distinto al titular de
  la camada (suplencia), y las horas se acreditan a quien la dictó.
- **FR-006**: El sistema DEBE reportar horas dictadas por profesor y período.
- **FR-007**: El importe a liquidar DEBE calcularse con la moneda de la
  organización y nunca sumar monedas distintas, igual que el resto de lo
  financiero.
- **FR-008**: El reporte de liquidación DEBE responder 403 al rol `soporte`.

## Decisiones a verificar

- **DV-001**: ¿El mínimo de asistencia es por curso, por camada, o global de
  la academia?
- **DV-002**: ¿"Tarde" cuenta como presente para el porcentaje?
- **DV-003**: ¿Se genera el cronograma automáticamente al crear la camada, o
  es una acción explícita? *(propuesta: explícita — generar 40 clases sin que
  nadie lo pida es difícil de deshacer)*
- **DV-004**: ¿Los feriados se excluyen solos? Requiere un calendario de
  feriados de Uruguay y Paraguay. *(propuesta: no en v1; se cancelan a mano)*
- **DV-005**: ¿El profesor tiene acceso propio al sistema para tomar
  asistencia? Hoy `teacher.email` existe pero NO crea cuenta — decisión
  explícita del dueño en el ciclo 005. **Esta es la decisión que define si la
  feature se usa de verdad o si la carga queda toda en coordinación.**

## Out of Scope

- Cuenta y panel para el profesor (depende de DV-005; sería su propio ciclo).
- Calendario de feriados automático.
- Notificación al alumno por inasistencia (depende del scheduler, ver
  [011](../011-operativa-menor/spec.md)).
- Aula virtual, streaming o grabaciones.

## Dependencias

Ninguna bloqueante. Puede implementarse en paralelo a
[008](../008-cobranza/spec.md).

**Habilita**: [010](../010-evaluacion-y-certificados/spec.md) — el criterio de
aprobación por presencia necesita esta data.
