# 014 — Portal del profesor

**Estado**: **IMPLEMENTADA (2026-08-28)** · **Depende de**: 012, 013 ·
**Habilita**: 016, 017

Los cuatro criterios de éxito quedaron verificados de punta a punta con el
arnés E2E (`pnpm test:e2e`, **136/136**) contra la app real:

| | Criterio | Cómo se verificó |
|---|---|---|
| SC-001 | Asistencia del portal aparece en coordinación | El profesor marca y el dato sale en `/api/cohorts/[id]/attendance` |
| SC-002 | No alcanza cohortes ajenas | 404 **con el cuerpo idéntico** al de una cohorte inventada |
| SC-003 | Sin datos financieros | La respuesta cruda no contiene `cost`, `currency`, `installment` ni `payment` |
| SC-004 | Asistencia en celular sin zoom | Botones de 44px, guarda al tocar, una fila por alumno |

## Por qué esta fase existe

Hoy la asistencia y las notas las carga coordinación transcribiendo lo que el
profesor anotó en su cuaderno. El dato entra tarde, con errores de copia, y a
veces no entra.

Es la primera audiencia nueva del sistema y **por eso va antes que la de
alumnos**: son 7 personas contra 340. Si el modelo de permisos de
[012](../012-identidad-y-permisos/spec.md) tiene un problema, se descubre con
7 usuarios y no con 340.

## Cambio de decisión registrado

Esta fase **revierte la DV-005 de [009](../009-clases-y-asistencia/spec.md)**,
resuelta el 2026-08-21 como: *"el profesor NO tiene acceso al sistema en v1;
coordinación carga la asistencia"*.

La decisión nueva (2026-08-26) es que sí lo tiene. Queda asentado que es un
cambio de criterio del dueño, no un descuido: la 009 se construyó bajo el
supuesto anterior y su lógica de asistencia sigue valiendo entera.

## User Scenarios

### US1 — El profesor ve solo lo suyo (Priority: P1)

Como profesor quiero entrar y ver únicamente mis cohortes, sin toparme con
datos de otros cursos, de otros docentes ni de la parte comercial de la
academia.

**Escenario de seguridad**: el profesor A abre la URL de una cohorte del
profesor B y recibe 404, no 403. Un 403 confirma que la cohorte existe.

### US2 — Toma de asistencia (Priority: P1)

Como profesor quiero pasar lista desde el celular durante la clase, en una
pantalla que se use con una mano y sin buscar nada.

### US3 — Carga de resultados (Priority: P1)

Como profesor quiero registrar quién aprobó cada evaluación de mi cohorte,
reusando la planilla de [010](../010-evaluacion-y-certificados/spec.md).

### US4 — Material y anuncios (Priority: P2)

Como profesor quiero publicar el material de mi clase y avisar cambios de
horario sin pedírselo a coordinación.

### US5 — Mis horas dictadas (Priority: P2)

Como profesor quiero ver cuántas clases di y cuántas horas suman, porque de
ahí sale lo que cobro.

## Requirements

- **FR-001**: El profesor DEBE acceder solo a cohortes donde figure como
  docente, sea de la cohorte o de una clase puntual (una suplencia).
- **FR-002**: Una cohorte ajena DEBE responder 404, no 403.
- **FR-003**: El portal NO DEBE exponer datos comerciales: montos, cuotas,
  pagos, morosidad ni datos de contacto más allá del nombre del alumno.
- **FR-004**: El profesor DEBE poder tomar asistencia de sus clases.
- **FR-005**: El profesor DEBE poder cargar y corregir resultados de las
  evaluaciones de sus cohortes.
- **FR-006**: El profesor NO DEBE poder crear ni borrar evaluaciones sin
  permiso explícito (DV-002).
- **FR-007**: El profesor DEBE poder publicar material y anuncios en sus
  cohortes.
- **FR-008**: El portal DEBE vivir en su propia superficie (`/api/portal/...`)
  y NO reusar los endpoints del staff.
- **FR-009**: La toma de asistencia DEBE funcionar en pantalla de celular.
- **FR-010**: El profesor DEBE ver sus horas dictadas, sin ver su tarifa ni
  lo que cobra otro docente.

## Decisiones a verificar

- **DV-001**: ¿El profesor puede corregir la asistencia de una clase pasada, o
  solo del día? *(propuesta: puede, con registro de quién y cuándo — el
  cuaderno se transcribe tarde y esa es la realidad.)*
- **DV-002**: ¿Puede crear evaluaciones o solo cargar resultados de las que
  definió coordinación?
- **DV-003**: ¿Ve la asistencia acumulada del alumno (que define si aprueba)
  o solo la de sus propias clases?
- **DV-004**: ¿Ve el correo y teléfono de sus alumnos? Es cómodo para él y es
  dato personal de ellos.
- **DV-005**: ¿Qué pasa cuando termina la cohorte? ¿Sigue viéndola?
  *(propuesta: sí, en solo lectura — le sirve para reusar material.)*

## Success Criteria

- **SC-001**: Un profesor entra, toma asistencia de su clase y el dato aparece
  en el panel de coordinación en el acto.
- **SC-002**: Un profesor NO puede alcanzar ninguna cohorte ajena, verificado
  por test.
- **SC-003**: Ningún endpoint del portal expone datos financieros, verificado
  por test.
- **SC-004**: La toma de asistencia se completa en un celular sin zoom.

## Out of Scope

- Chat con los alumnos (es 017).
- Corrección de entregas (es 016).
- Que el profesor gestione su propia disponibilidad horaria.
