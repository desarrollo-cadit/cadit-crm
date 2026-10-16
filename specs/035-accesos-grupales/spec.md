# Feature Specification: Accesos grupales, monitoreo de licencias y limpieza del checklist

**Feature Branch**: `035-accesos-grupales`

**Created**: 2026-10-16

**Status**: Draft

**Depende de**: 005 (licencias), cursos offline, 028 (especializaciones), 034 (varias licencias por inscripción)

**Input**: Pedido del dueño (2026-10-16): "Poder marcar el licenciamiento no solo individual sino a nivel grupal. Si marco los cursos offline para todo el grupo, que no me deje marcar individual, así no quedan accesos mal. Lo mismo con las licencias: si ya está marcada a nivel general, no poder asignarle la misma individual. Poder ver en algún lugar quiénes tienen licencias asignadas por producto, monitorear y desasignar (solo si fue individual, no si la tiene todo el grupo). Y borrar del desplegable del alumno en la cohorte los checkbox de correo de T&C enviado y acceso a Academia; hoy el registro y el envío de correos están acá mismo."

## Por qué esta fase existe

1. **Las licencias se asignan de a una.** Una cohorte de 16 alumnos que usa
   Revit son 16 asignaciones a mano, y quien se inscribe después queda sin
   licencia hasta que alguien se acuerde.
2. **Lo grupal y lo individual se pisan.** Los cursos offline ya se asignan
   al grupo, pero también se pueden marcar o quitar por alumno sobre el mismo
   curso. El resultado es un acceso que nadie puede explicar: ¿lo tiene por
   el grupo, por él, o se lo sacaron?
3. **No hay una vista por producto.** Para saber quién tiene Revit hay que
   recorrer cohorte por cohorte. El stock se ve como un número, no como una
   lista de personas.
4. **El checklist del alumno arrastra pasos viejos.** "Acceso a Academia
   Online" es de antes de los cursos offline dentro del CRM. "Correo de T&C
   enviado" es una casilla que en realidad MANDA un correo: una acción con
   forma de marca.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Licencia para todo el grupo (Priority: P1)

En la cohorte "Revit Arquitectura — Octubre", la coordinación asigna **Revit
para todo el grupo**. Cada uno de los 16 alumnos queda con su licencia de
Revit, y el stock de Revit baja en 16. Una alumna que se inscribe una semana
después recibe la licencia sola.

**Why this priority**: Es el pedido principal y el que más trabajo ahorra.

**Independent Test**: Asignar un programa al grupo de una cohorte con
alumnos, verificar que cada alumno lo tiene y el stock bajó en esa cantidad;
inscribir a una persona nueva y verificar que también lo recibe.

**Acceptance Scenarios**:

1. **Given** una cohorte con 16 alumnos y 20 licencias libres de Revit,
   **When** se asigna Revit al grupo, **Then** los 16 quedan con Revit,
   marcados como "del grupo", y quedan 4 libres.
2. **Given** una cohorte con 16 alumnos y 10 licencias libres, **When** se
   intenta asignar Revit al grupo, **Then** no se asigna ninguna y el sistema
   dice cuántas faltan.
3. **Given** un programa asignado al grupo, **When** se inscribe una persona
   nueva, **Then** recibe la licencia del grupo; si no hay stock, la
   inscripción se guarda igual y la falta de licencia queda visible en la
   cohorte y en la vista de licencias.
4. **Given** un programa asignado al grupo, **When** se lo quita del grupo,
   **Then** se liberan las licencias del grupo de todos los alumnos; las
   individuales de otros programas no se tocan.
5. **Given** una especialización, **When** se asigna un programa al grupo de
   la especialización, **Then** vale como paquete para todo el programa; si
   se asigna al grupo de un módulo, vale solo para los alumnos de ese módulo.
6. **Given** un alumno dado de baja de la cohorte, **When** se lo da de baja,
   **Then** su licencia del grupo se libera.

---

### User Story 2 - Lo grupal bloquea lo individual (Priority: P1)

Con Revit asignado al grupo y el curso offline "Fundamentos BIM" asignado al
grupo, en la ficha de cada alumno los dos aparecen como **"Asignado al
grupo"**, sin casilla para marcar ni desmarcar. La coordinación solo puede
asignar a mano lo que el grupo no tiene.

**Why this priority**: Es lo que evita accesos que nadie puede explicar.

**Independent Test**: Con un programa y un curso offline asignados al grupo,
verificar que no se pueden asignar ni quitar individualmente para ningún
alumno, y que otros programas y cursos sí.

**Acceptance Scenarios**:

1. **Given** Revit asignado al grupo, **When** la coordinación mira la ficha
   de un alumno, **Then** Revit figura "Asignado al grupo" y no puede
   asignarse ni quitarse individualmente.
2. **Given** Revit asignado al grupo, **When** se intenta asignar Revit
   individualmente a un alumno por cualquier vía, **Then** el sistema lo
   rechaza.
3. **Given** un curso offline asignado al grupo, **When** se mira un alumno,
   **Then** el curso figura "Asignado al grupo", sin control individual.
4. **Given** un curso offline asignado al grupo, **When** se intenta otorgar
   o quitar ese curso individualmente, **Then** el sistema lo rechaza.
5. **Given** alumnos que ya tenían Revit individual, **When** se asigna Revit
   al grupo, **Then** esas licencias pasan a ser del grupo (no se duplican ni
   se descuenta stock dos veces).
6. **Given** datos anteriores a esta fase donde un alumno tiene un curso
   offline otorgado individualmente que también está asignado al grupo,
   **When** se despliega, **Then** el acceso individual redundante se quita
   sin que el alumno pierda el acceso (lo sigue teniendo por el grupo).
7. **Given** datos anteriores donde un alumno tiene quitado individualmente
   un curso asignado al grupo, **When** se despliega, **Then** esa excepción
   se conserva y figura como "Excepción anterior" para que una persona
   decida; no se crean nuevas excepciones.

---

### User Story 3 - Ver y gestionar licencias por producto (Priority: P2)

La coordinación abre **Licencias** y ve, por programa: total, asignadas y
libres. Entra a Revit y ve la lista: alumno, cohorte, si es del grupo o
individual, desde cuándo y hasta cuándo. Desasigna una licencia individual;
en una del grupo el botón no está, y se indica que se quita desde la cohorte.

**Why this priority**: Monitorear el stock por persona; hoy no existe, pero
no bloquea asignar.

**Independent Test**: Con licencias del grupo e individuales de un programa,
abrir la vista, verificar los contadores y la lista, desasignar una
individual y verificar que el stock sube en uno.

**Acceptance Scenarios**:

1. **Given** licencias asignadas, **When** se abre la vista, **Then** cada
   programa muestra total, asignadas y libres, y los números coinciden con
   el stock.
2. **Given** un programa, **When** se lo abre, **Then** se listan todas sus
   licencias asignadas con alumno, cohorte, origen (grupo o individual),
   fecha de asignación y vencimiento.
3. **Given** una licencia individual, **When** se la desasigna, **Then** se
   libera y el stock sube en uno.
4. **Given** una licencia del grupo, **When** se la mira en la lista,
   **Then** no ofrece desasignar y dice "Se quita desde la cohorte", con un
   acceso directo.
5. **Given** la lista, **When** se filtra por cohorte, por origen o se busca
   un alumno, **Then** se ve solo lo filtrado.
6. **Given** un programa con alumnos del grupo sin licencia por falta de
   stock (US1, escenario 3), **When** se abre, **Then** esos faltantes se
   ven destacados.

---

### User Story 4 - Checklist del alumno sin pasos viejos (Priority: P3)

En el desplegable de un alumno en la cohorte ya no están "Acceso a Academia
Online" ni la casilla "Correo de T&C enviado". En su lugar hay un botón
**"Enviar T&C"** que muestra "Enviado el 12/10" cuando ya se mandó.

**Why this priority**: Limpieza; no cambia lo que se puede hacer.

**Independent Test**: Abrir el desplegable de un alumno, verificar que no
están las dos casillas, enviar el T&C con el botón y verificar la fecha.

**Acceptance Scenarios**:

1. **Given** el desplegable de un alumno, **When** se lo abre, **Then** no
   aparece "Acceso a Academia Online".
2. **Given** un alumno sin T&C enviado, **When** se aprieta "Enviar T&C" y se
   confirma, **Then** se envía el correo y el botón pasa a mostrar la fecha.
3. **Given** un alumno con T&C ya enviado, **When** se lo mira, **Then** se ve
   "Enviado el …" y se puede reenviar con confirmación explícita.
4. **Given** el progreso del checklist que se muestra en la tabla, **When**
   se calcula, **Then** ya no cuenta "Acceso a Academia Online".
5. **Given** datos ya guardados de esos pasos, **When** se despliega,
   **Then** no se borran (siguen en el historial), solo dejan de mostrarse
   como casillas.

---

### Edge Cases

- **Alumno en dos cohortes que asignan el mismo programa al grupo**: tiene
  una licencia por cada inscripción (son cohortes distintas), igual que hoy
  con las individuales.
- **Especialización con el programa en el paquete y en un módulo**: está
  permitido (034); la pantalla lo advierte.
- **Quitar del grupo un programa con licencias ya vencidas**: se liberan
  igual.
- **Cambiar de cohorte a un alumno** ("Mudar"): pierde las licencias del
  grupo de la cohorte vieja y recibe las de la nueva.
- **Una licencia del grupo con vencimiento**: el vencimiento se define al
  asignar al grupo y vale para todos.
- **Sin stock al asignar al grupo**: no se asigna a nadie (todo o nada); al
  inscribir a alguien nuevo sin stock, la inscripción no se bloquea.

## Requirements *(mandatory)*

### Functional Requirements

**Licencias grupales**

- **FR-001**: La coordinación MUST poder asignar un programa a todo el grupo
  de una cohorte, con un vencimiento opcional.
- **FR-002**: Asignar al grupo MUST dar una licencia de ese programa a cada
  alumno activo de la cohorte, descontando stock por cada una; si no alcanza
  el stock MUST NOT asignarse ninguna, y el sistema MUST decir cuántas
  faltan.
- **FR-003**: Cada licencia MUST registrar su origen: *grupo* o
  *individual*.
- **FR-004**: Quien se inscribe en una cohorte con programas del grupo MUST
  recibir esas licencias; sin stock, la inscripción MUST guardarse igual y
  la falta MUST quedar visible.
- **FR-005**: Quitar un programa del grupo MUST liberar las licencias de ese
  origen de todos los alumnos de la cohorte, y MUST NOT tocar licencias
  individuales.
- **FR-006**: Dar de baja a un alumno o mudarlo de cohorte MUST liberar sus
  licencias del grupo de esa cohorte.
- **FR-007**: En una especialización, un programa del grupo MUST aplicar a
  las inscripciones de la especialización (paquete); en un módulo, a las de
  ese módulo.

**Exclusión entre grupal e individual**

- **FR-008**: Si un programa está asignado al grupo, MUST NOT poder
  asignarse ni quitarse individualmente a ningún alumno de esa cohorte, en
  ninguna pantalla ni ruta.
- **FR-009**: Si un curso offline está asignado al grupo, MUST NOT poder
  otorgarse ni quitarse individualmente a ningún alumno de esa cohorte.
- **FR-010**: Asignar al grupo un programa que algunos alumnos ya tenían
  individual MUST convertir esas licencias en del grupo, sin duplicar ni
  descontar stock dos veces.
- **FR-011**: Al desplegar, los otorgamientos individuales de cursos offline
  que repiten uno del grupo MUST quitarse (el alumno conserva el acceso por
  el grupo); las quitas individuales existentes MUST conservarse y mostrarse
  como "Excepción anterior".
- **FR-012**: La ficha del alumno MUST mostrar lo asignado al grupo como
  "Asignado al grupo", sin controles individuales.

**Vista de licencias**

- **FR-013**: El panel MUST tener una vista de Licencias con total,
  asignadas y libres por programa.
- **FR-014**: Por programa, la vista MUST listar cada licencia asignada con
  alumno, cohorte, origen, fecha de asignación y vencimiento, con filtros
  por cohorte y origen y búsqueda por alumno.
- **FR-015**: La vista MUST permitir desasignar licencias individuales, y
  MUST NOT permitirlo en las del grupo (indicando que se quitan desde la
  cohorte, con acceso directo).
- **FR-016**: La vista MUST destacar a los alumnos que deberían tener una
  licencia del grupo y no la tienen por falta de stock.

**Checklist del alumno**

- **FR-017**: El desplegable del alumno en la cohorte MUST NOT mostrar
  "Acceso a Academia Online" ni la casilla "Correo de T&C enviado".
- **FR-018**: El envío individual del T&C MUST seguir disponible como botón
  "Enviar T&C" con confirmación, que muestra la fecha del último envío y
  permite reenviar con confirmación explícita.
- **FR-019**: El progreso del checklist MUST dejar de contar "Acceso a
  Academia Online".
- **FR-020**: Los datos ya guardados de esos pasos MUST conservarse.

**Transversales**

- **FR-021**: Cada acción MUST exigir la capacidad que hoy gobierna su
  equivalente (licencias, cursos offline, inscripciones); la vista de
  Licencias MUST exigir la capacidad de ver la gestión académica.
- **FR-022**: Toda lectura y escritura MUST quedar aislada por organización.

### Key Entities *(include if feature involves data)*

- **Programa del grupo**: un programa asignado a una cohorte entera, con
  vencimiento opcional.
- **Licencia** (cambia): suma su origen, *grupo* o *individual*.
- **Curso offline del grupo** (sin cambios de forma): pasa a excluir el
  control individual del mismo curso.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Dar una licencia a los 16 alumnos de una cohorte es una sola
  acción.
- **SC-002**: Cero alumnos con el mismo programa o curso offline asignado a
  la vez por el grupo y en forma individual en la misma cohorte.
- **SC-003**: Para cualquier programa, la vista de Licencias responde
  "quién lo tiene" sin abrir ninguna cohorte, y sus números coinciden con el
  stock.
- **SC-004**: El 100% de los intentos de desasignar una licencia del grupo
  desde la vista se rechaza con el motivo y el acceso a la cohorte.
- **SC-005**: Ninguna licencia ni acceso existente se pierde al desplegar.

## Assumptions

- **Cada alumno del grupo descuenta una licencia del stock**: una licencia
  es un asiento de software, no un permiso abstracto.
- **Todo o nada al asignar al grupo**: asignar a una parte del grupo crea
  justamente el desorden que esta fase quiere evitar.
- **"Software instalado" se queda** en el checklist: no se pidió quitarlo.
- **Las quitas individuales de cursos offline ya existentes se conservan**
  como "Excepción anterior" en lugar de borrarse: borrarlas daría acceso a
  alguien a quien una persona se lo había quitado a propósito.
- **"Acceso a Academia Online"** es un paso de antes de los cursos offline en
  el CRM; su dato se conserva pero deja de mostrarse.
