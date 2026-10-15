# Feature Specification: Talleres

**Feature Branch**: `033-talleres`

**Created**: 2026-10-15

**Status**: Draft

**Depende de**: 032 (tipos de curso) · 005 (formularios de captación) · 008 (cobranza)

**Input**: Pedido del dueño (2026-10-15): "A los talleres se les hace marketing, se crea un formulario de Google, la gente se inscribe y después se revisa a cada rato ese formulario para ver quién confirmó. A veces tienen costo y a veces son abiertos; algunos son online y otros presenciales. Lo ideal es que se inscriban a través de un formulario en nuestra web y que, una vez lleno, aparezcan anotados en el taller y como contacto en el CRM, como los formularios de cursos. Cuando tienen costo, lo ideal es que quede anotado para Cobranza y Finanzas."

## Por qué esta fase existe

Hoy un taller vive **fuera del CRM**: un formulario de Google, una planilla
que alguien revisa a cada rato, y la confirmación de quién viene se lleva a
mano. Eso tiene tres costos:

1. **Nadie ve el taller completo.** Quién se anotó, quién confirmó, quién
   pagó y quién vino viven en lugares distintos.
2. **Los inscriptos no llegan al CRM.** Una persona que vino a un taller
   gratuito es el mejor candidato para un curso, y hoy no queda registrada
   como contacto.
3. **La plata no entra a Finanzas.** Un taller con costo se cobra, pero ese
   cobro no aparece en la caja del mes.

Y hay una restricción que cierra la puerta al atajo: la constitución del
proyecto **prohíbe depender de Google**, así que el formulario no se puede
"integrar"; tiene que reemplazarse.

**La decisión de diseño (dueño, 2026-10-15)**: el taller tiene **su propia
sección**, con un flujo liviano, pero corre sobre la **misma columna
vertebral** que un curso. Un taller es un curso de tipo *Taller* (032), cada
edición es una cohorte y cada persona anotada es una inscripción. Así la
cobranza, Finanzas y el contacto del CRM funcionan sin construir nada
paralelo; lo nuevo es la experiencia.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Publicar un taller y recibir inscripciones desde la web (Priority: P1)

La coordinación crea el taller "Introducción a Revit" en la sección
**Talleres**: fecha y hora, modalidad (online con enlace, o presencial con
lugar), cupo, si es gratuito o tiene costo, y lo marca como abierto. La web
de la academia lo muestra con su botón de inscripción. Una persona completa
el formulario de la web; en ese momento aparece **anotada** en el taller, y
existe como contacto en el CRM.

**Why this priority**: Es lo que reemplaza el formulario de Google. Sin esto
no hay feature.

**Independent Test**: Crear un taller abierto, enviar el formulario público
con nombre y teléfono, y verificar que la persona aparece anotada en el
taller y como contacto en el CRM.

**Acceptance Scenarios**:

1. **Given** un taller abierto, **When** una persona envía el formulario de
   la web con nombre y teléfono válidos, **Then** queda anotada en el taller
   con estado *Anotado* y existe como contacto.
2. **Given** una persona que ya es contacto del CRM (mismo teléfono),
   **When** se anota a un taller, **Then** no se crea un contacto duplicado:
   la inscripción queda en su contacto existente.
3. **Given** una persona ya anotada en un taller, **When** vuelve a enviar
   el formulario del mismo taller, **Then** no se crea una segunda
   inscripción y recibe la misma respuesta de éxito.
4. **Given** un taller cerrado, pasado o con el cupo lleno, **When** alguien
   envía el formulario, **Then** no se anota y recibe un mensaje claro
   ("las inscripciones están cerradas" o "no quedan lugares").
5. **Given** la web de la academia, **When** consulta los talleres abiertos,
   **Then** recibe los talleres próximos con nombre, descripción, fecha,
   modalidad, lugar o "online", si es gratuito o su costo, y si quedan
   lugares — nunca el enlace de la reunión ni datos de los inscriptos.

---

### User Story 2 - Gestionar la lista de inscriptos (Priority: P1)

En la sección Talleres, la coordinación abre "Introducción a Revit" y ve la
lista de inscriptos con su estado: **Anotado**, **Confirmado**, **Asistió**,
**No asistió** o **Cancelado**. Marca a quienes confirmaron, y el día del
taller marca quién vino. Ve de un vistazo cuántos hay en cada estado y
cuántos lugares quedan.

**Why this priority**: Es el "revisar el formulario a cada rato" que la
academia quiere dejar de hacer.

**Independent Test**: Con un taller con tres anotados, confirmar a dos,
marcar a uno como asistió y verificar los contadores y el cupo.

**Acceptance Scenarios**:

1. **Given** un inscripto *Anotado*, **When** la coordinación lo marca
   *Confirmado*, **Then** el estado cambia y el contador se actualiza.
2. **Given** un inscripto *Cancelado*, **When** se mira el cupo, **Then** no
   ocupa lugar.
3. **Given** un taller lleno, **When** un inscripto pasa a *Cancelado*,
   **Then** se libera un lugar y el formulario vuelve a aceptar
   inscripciones.
4. **Given** la lista de inscriptos, **When** la coordinación necesita
   contactar a alguien, **Then** ve su teléfono y correo y puede ir a su
   conversación en el CRM.
5. **Given** la coordinación quiere anotar a alguien que llamó por teléfono,
   **When** lo agrega a mano desde la lista, **Then** queda anotado igual que
   si hubiera venido de la web.
6. **Given** un taller ya realizado, **When** la coordinación marca la
   asistencia, **Then** puede marcar *Asistió* o *No asistió* a cada
   confirmado.

---

### User Story 3 - Cobrar un taller con costo (Priority: P1)

"Revit avanzado" cuesta UYU 1.500. Cuando alguien se anota, su inscripción
nace con **un pago único pendiente** por ese monto. La coordinación registra
el pago desde la lista del taller (fecha, medio, recibo), y ese pago aparece
en Cobranza y en la caja del mes de Finanzas, igual que el de cualquier
curso.

**Why this priority**: El dueño pidió explícitamente que lo cobrado quede en
Cobranza y Finanzas.

**Independent Test**: Anotar a una persona en un taller con costo,
registrar su pago y verificar que figura en la caja del mes de Finanzas.

**Acceptance Scenarios**:

1. **Given** un taller con costo, **When** alguien se anota, **Then** su
   inscripción tiene un saldo pendiente igual al costo del taller, en su
   moneda.
2. **Given** un inscripto con saldo pendiente, **When** se registra su pago,
   **Then** el saldo queda en cero y el pago aparece en Finanzas en el mes de
   la fecha del pago.
3. **Given** un taller gratuito, **When** alguien se anota, **Then** no se
   genera ningún saldo ni aparece en Cobranza.
4. **Given** la lista de un taller con costo, **When** la coordinación la
   mira, **Then** ve quién pagó y quién no.
5. **Given** un inscripto que pagó y luego cancela, **When** pasa a
   *Cancelado*, **Then** el pago no se borra: la devolución, si la hay, se
   gestiona como en cualquier otra inscripción.

---

### User Story 4 - Avisar por WhatsApp (Priority: P2)

Al anotarse, la persona recibe por WhatsApp la confirmación con fecha, hora y
modalidad. El día anterior, los confirmados reciben un recordatorio; si el
taller es online, el recordatorio lleva el enlace.

**Why this priority**: Reduce la tasa de faltazos y el trabajo de avisar a
mano, pero el taller funciona sin esto.

**Independent Test**: Anotar a una persona y verificar que se envía la
confirmación por el canal de WhatsApp; adelantar al día anterior y verificar
el recordatorio a los confirmados.

**Acceptance Scenarios**:

1. **Given** WhatsApp configurado, **When** alguien se anota desde la web,
   **Then** recibe un mensaje de confirmación con los datos del taller.
2. **Given** un taller online para mañana, **When** llega la hora del
   recordatorio, **Then** cada inscripto *Confirmado* recibe el enlace, y
   ningún *Anotado* sin confirmar ni *Cancelado* lo recibe.
3. **Given** WhatsApp no configurado o un fallo de envío, **When** alguien se
   anota, **Then** la inscripción se guarda igual; el fallo queda visible en
   la lista del taller.
4. **Given** un contacto sin teléfono, **When** se anota, **Then** no se
   intenta el envío y no se bloquea la inscripción.

---

### User Story 5 - Ver los talleres del año (Priority: P2)

La sección Talleres lista los próximos arriba y los realizados abajo, con
filtro por año (el mismo criterio de 032). Cada taller muestra fecha,
modalidad, gratuito o costo, inscriptos y cupo.

**Why this priority**: Orden y vista clara; no bloquea la operación.

**Independent Test**: Con talleres de dos años distintos, filtrar por año y
verificar que solo se ven los del año elegido.

**Acceptance Scenarios**:

1. **Given** talleres pasados y futuros, **When** se abre la sección,
   **Then** los próximos aparecen primero, ordenados por fecha.
2. **Given** el filtro de año, **When** se elige 2026, **Then** solo se ven
   los talleres de 2026.

---

### Edge Cases

- **Taller de varias jornadas** (dos sábados): una edición puede tener más
  de una sesión; la asistencia se marca a nivel taller, no por sesión, en
  esta fase.
- **Reedición** del mismo taller: es otra edición (otra cohorte) del mismo
  taller; los inscriptos de una no pasan a la otra.
- **Cambio de costo** después de que hay inscriptos: los ya anotados
  conservan el monto con el que se anotaron; los nuevos toman el nuevo.
- **Cambio de fecha o de enlace**: los datos nuevos se usan en los
  recordatorios siguientes; reenviar avisos de cambio es manual.
- **Formulario enviado con datos inválidos** (teléfono mal escrito, nombre
  vacío): se rechaza sin crear nada y con un mensaje que la web pueda
  mostrar.
- **Abuso del formulario**: los envíos públicos tienen el mismo límite por
  origen que los formularios de cursos.
- **Inscripto que también es alumno de un curso**: es el mismo contacto; su
  legajo y su recorrido de alumno no se mezclan con el taller.
- **Taller sin cupo** definido: inscripciones ilimitadas.
- **Borrar un taller** con inscriptos: no se permite (regla de 032); se
  cierra o se cancela.
- **Taller cancelado por la academia**: se marca cancelado, deja de
  aceptar inscripciones y deja de salir en la web; los inscriptos conservan
  su historia.

## Requirements *(mandatory)*

### Functional Requirements

**Sección y datos del taller**

- **FR-001**: El panel MUST tener una sección **Talleres** propia, visible
  para quien tenga la capacidad de ver la gestión académica.
- **FR-002**: Un taller MUST ser un curso de tipo *Taller* (032), y cada
  edición del taller MUST tener: fecha y hora de inicio, duración o fin,
  modalidad (*Online* u *Presencial*), enlace de reunión si es online, lugar
  si es presencial, cupo (opcional), gratuito o con costo (monto y moneda), y
  estado de inscripción (*Abierta*, *Cerrada*, *Cancelada*).
- **FR-003**: Crear un taller desde la sección MUST crear en un solo paso el
  curso de tipo *Taller* y su primera edición; MUST poder agregarse otra
  edición a un taller existente.
- **FR-004**: Un taller MUST NOT exigir plan de cuotas, cronograma de clases,
  evaluaciones ni vendedor.

**Inscripción pública**

- **FR-005**: El sistema MUST exponer a la web la lista de talleres
  abiertos y próximos con sus datos públicos (nombre, descripción, fecha,
  modalidad, lugar u "online", gratuito o costo, si quedan lugares). MUST
  NOT exponer el enlace de la reunión, datos de inscriptos ni talleres
  cerrados o cancelados.
- **FR-006**: El sistema MUST aceptar inscripciones públicas a un taller con
  al menos nombre y teléfono (apellido, correo y mensaje opcionales),
  validadas, y con el mismo límite de envíos por origen que los formularios
  de cursos.
- **FR-007**: Una inscripción pública MUST reutilizar el contacto existente
  cuando la identidad (teléfono normalizado) ya existe, o crear uno nuevo en
  caso contrario.
- **FR-008**: Una persona MUST NOT quedar anotada dos veces en la misma
  edición; un reenvío MUST responder como éxito sin duplicar.
- **FR-009**: El sistema MUST rechazar inscripciones a talleres cerrados,
  cancelados, ya realizados o sin lugares, con un motivo que la web pueda
  mostrar.
- **FR-010**: El cupo MUST contar las inscripciones en estado *Anotado*,
  *Confirmado*, *Asistió* y *No asistió*; las *Canceladas* MUST NOT ocupar
  lugar.

**Gestión de inscriptos**

- **FR-011**: La lista de inscriptos MUST mostrar nombre, teléfono, correo,
  estado, fecha de inscripción, origen (web o carga manual) y, si el taller
  tiene costo, si pagó.
- **FR-012**: La coordinación MUST poder cambiar el estado de cada inscripto
  entre *Anotado*, *Confirmado*, *Asistió*, *No asistió* y *Cancelado*, y
  MUST poder anotar a alguien a mano.
- **FR-013**: La lista MUST mostrar los contadores por estado y los lugares
  disponibles.
- **FR-014**: Desde un inscripto MUST poder abrirse su contacto y su
  conversación del CRM.

**Cobro**

- **FR-015**: En un taller con costo, cada inscripción MUST nacer con un
  único saldo pendiente igual al costo vigente al momento de anotarse, en la
  moneda del taller.
- **FR-016**: Los pagos de un taller MUST registrarse con el mismo mecanismo
  que los pagos de cualquier inscripción, y MUST aparecer en Cobranza y en
  la caja del mes de Finanzas.
- **FR-017**: En un taller gratuito MUST NOT generarse saldo ni aparecer
  nada en Cobranza.
- **FR-018**: Cancelar una inscripción MUST NOT borrar sus pagos.

**Avisos**

- **FR-019**: Al anotarse, el sistema SHOULD enviar por WhatsApp una
  confirmación con los datos del taller; un fallo de envío MUST NOT impedir
  la inscripción y MUST quedar visible.
- **FR-020**: El día anterior al taller, el sistema SHOULD enviar un
  recordatorio a los inscriptos *Confirmados*, con el enlace si es online, y
  MUST NOT enviarlo a *Anotados* sin confirmar ni a *Cancelados*. Cada
  persona MUST recibir como máximo un recordatorio por edición.

**Transversales**

- **FR-021**: Los inscriptos a talleres MUST NOT aparecer como alumnos de
  cursos en el legajo académico, ni contar en la matrícula de cursos, ni en
  los portales del alumno o del profesor.
- **FR-022**: Gestionar talleres y sus inscriptos MUST exigir las mismas
  capacidades que hoy gobiernan la gestión académica (ver) y las
  inscripciones (editar); registrar pagos MUST exigir la capacidad de
  cobranza que ya existe.
- **FR-023**: Toda lectura y escritura MUST quedar aislada por organización;
  la superficie pública MUST correr con el alcance de la organización de la
  instancia, como los formularios de cursos.

### Key Entities *(include if feature involves data)*

- **Taller**: un curso de tipo *Taller* (032), con nombre y descripción.
- **Edición de taller**: una cohorte del taller, con fecha, modalidad,
  enlace o lugar, cupo, costo y estado de inscripción.
- **Inscripción a taller**: la inscripción de un contacto a una edición, con
  su estado (*Anotado*, *Confirmado*, *Asistió*, *No asistió*,
  *Cancelado*), su origen (web o manual), el monto pactado si tiene costo, y
  la marca de los avisos enviados.
- **Pago**: el mismo de Cobranza; un único saldo por inscripción con costo.
- **Contacto**: el mismo del CRM; un contacto puede tener inscripciones a
  talleres y a cursos.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona se anota a un taller desde la web en menos de 1
  minuto y aparece en la lista del taller sin que nadie intervenga.
- **SC-002**: La coordinación deja de usar el formulario de Google: el 100%
  de los inscriptos de un taller real se gestiona desde la sección Talleres.
- **SC-003**: El 100% de los pagos de talleres registrados aparece en la
  caja del mes de Finanzas.
- **SC-004**: Cero contactos duplicados cuando una persona que ya existe en
  el CRM se anota a un taller.
- **SC-005**: El cupo nunca se supera por inscripciones de la web.
- **SC-006**: Ningún inscripto a taller aparece en el legajo, la matrícula o
  los portales de cursos.

## Assumptions

- **Un taller se cobra con un pago único**; no hay planes de cuotas para
  talleres.
- **La asistencia es por taller**, no por sesión, aunque el taller tenga
  varias jornadas.
- **La web de la academia** consume la lista pública y postea el formulario
  como ya hace con los cursos; el diseño de la página en la web queda fuera
  de este repositorio.
- **Los avisos por WhatsApp** usan el canal ya configurado del CRM; fuera de
  la ventana de 24 h se necesita una plantilla aprobada por Meta. Si no hay
  plantilla, el aviso no se envía y queda marcado como no enviado.
- **No hay certificados de taller** en esta fase.
- **Los inscriptos no reciben acceso al portal del alumno** por anotarse a un
  taller.
- **El recordatorio** se envía una vez, el día anterior, en horario de la
  organización; la hora exacta la define el plan.
