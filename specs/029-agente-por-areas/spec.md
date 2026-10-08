# Feature Specification: Agente por áreas — derivación por correo y autoconsulta del alumno

**Feature Branch**: `029-agente-por-areas`

**Created**: 2026-10-08

**Status**: Draft

**Input**: User description: "WhatsApp agent routing by topic with area handoff by email and student self-service queries" (ver conversación de diseño del 2026-10-08).

## Por qué esta fase existe

El número de WhatsApp de la organización es UNO, y por él entran tres
conversaciones que no tienen nada que ver entre sí:

| Tema | Quién escribe | Quién lo atiende hoy |
|---|---|---|
| **Ventas** — software y licencias (Autodesk y similares) | Empresas, interesados | El equipo comercial, **que no usa CadIT** |
| **Soporte** — problemas técnicos o de acceso | Clientes de software, alumnos | El equipo de soporte, **que no usa CadIT** |
| **Academia** — cursos, inscripciones, cursada | Interesados, alumnos, profesores | La academia, dentro de CadIT |

El agente actual tiene una sola personalidad y un solo `handoff` genérico: la
conversación queda "para un humano" sin decir **para cuál área**, y las dos
áreas que no miran CadIT nunca se enteran. Al mismo tiempo, los alumnos
preguntan por WhatsApp cosas que el sistema YA sabe —cuándo es su próxima
clase, cuánto deben— y hoy alguien de la academia tiene que buscarlas a mano.

Esta fase hace tres cosas: **saber quién escribe**, **saber de qué habla**, y
**actuar según el área**: derivar por correo a quien no usa CadIT, y responder
con datos reales a quien sí es de la academia.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Derivación de ventas y soporte por correo (Priority: P1)

Una empresa escribe "necesito 5 licencias de AutoCAD". El agente reconoce que es
Ventas, pide lo que falta (nombre, empresa, producto, cantidad, correo o
teléfono de preferencia), y cuando tiene lo necesario manda un correo a la
casilla compartida de comercial con copia a las personas configuradas. Al
cliente le confirma que su consulta pasó al equipo comercial y le deja el
contacto del área. Lo mismo con Soporte ("no me activa la licencia"): qué
pasa, desde cuándo, con qué producto.

**Why this priority**: es el problema que hoy pierde dinero y clientes: las
consultas de ventas y soporte llegan a un canal que esas áreas no miran.

**Independent Test**: con la conversación de pruebas y el correo en modo
simulado, escribir como empresa interesada en licencias y verificar que se
genera exactamente un correo con el destinatario, las copias, el asunto y el
resumen esperados, y que el cliente recibe el cierre con el contacto del área.

**Acceptance Scenarios**:

1. **Given** el área Ventas configurada con casilla `comercial@…` y dos personas en copia, **When** un cliente escribe que quiere comprar licencias y luego aporta nombre, empresa, producto, cantidad y correo, **Then** se envía un único correo Para la casilla, CC las dos personas, Responder-a el correo del cliente, con asunto `[Ventas] <resumen> — <nombre> (<empresa>)`, y el cliente recibe el texto de contacto configurado.
2. **Given** un cliente que solo dijo "quiero licencias", **When** el agente evalúa el turno, **Then** NO deriva todavía: pide los datos faltantes, de a pocos y sin interrogatorio.
3. **Given** un cliente que se niega a dar algún dato, **When** el agente ya tiene al menos el motivo y una forma de contacto (el propio número de WhatsApp cuenta), **Then** deriva igual, indicando en el correo qué datos faltan.
4. **Given** una conversación ya derivada a Soporte, **When** el mismo cliente vuelve a escribir sobre el mismo problema dentro de la ventana de seguimiento, **Then** NO se crea un caso nuevo; si aporta información nueva, se envía un correo de seguimiento en el mismo hilo; si no, el agente le recuerda que el área ya tiene su caso.
5. **Given** el envío de correo falla, **When** el agente cierra la derivación, **Then** el cliente igual recibe el contacto del área, y la conversación queda marcada con la derivación fallida, visible para el staff.

---

### User Story 2 — Identificar quién escribe y clasificar el tema (Priority: P1)

Antes de cualquier decisión de la IA, el sistema determina quién es el
contacto a partir de su identidad de WhatsApp: alumno con cursada activa,
profesor, lead conocido o desconocido. Con eso y el mensaje, el agente
clasifica el tema del turno en Ventas, Soporte o Academia. Si no está claro,
pregunta. Si a mitad de la charla el tema cambia, re-clasifica.

**Why this priority**: sin esto no hay derivación correcta ni autoconsulta
segura. Es la base de las otras dos historias.

**Independent Test**: en el Laboratorio, correr las personas nuevas y
verificar que el juez marca la clasificación como correcta en la tasa
objetivo; con un contacto alumno real de pruebas, verificar que el perfil
detectado es "alumno" sin intervención del modelo.

**Acceptance Scenarios**:

1. **Given** un contacto cuya identidad de WhatsApp coincide con un alumno con cursada activa, **When** escribe, **Then** el perfil del turno es "alumno", calculado por el sistema y no por el modelo.
2. **Given** un mensaje ambiguo ("tengo un problema con Revit"), **When** el agente no puede distinguir si es soporte de software o una consulta de curso, **Then** hace una pregunta de aclaración breve en lugar de derivar.
3. **Given** un alumno que primero pregunta por su clase y luego por una licencia para su empresa, **When** cambia el tema, **Then** el agente responde lo académico y trata lo de licencias como Ventas, sin quedar "pegado" al primer tema.
4. **Given** una persona que pide explícitamente hablar con alguien de la academia, **When** el tema es Academia, **Then** se mantiene el `handoff` humano actual dentro de CadIT (la academia sí usa el inbox).

---

### User Story 3 — Autoconsulta del alumno por WhatsApp (Priority: P2)

Un alumno identificado pregunta "¿cuándo es mi próxima clase?", "¿cuánto
debo?", "¿dónde está el material de la clase 4?" o "¿cómo voy en el curso
online?". El agente consulta los datos reales de ESE alumno y responde.

**Why this priority**: saca del inbox las consultas repetitivas de mayor
volumen, pero depende de la clasificación (US2) y vale menos que no perder
ventas (US1).

**Independent Test**: con un alumno de pruebas con cohorte, clases, cuotas y
un curso offline asignado, preguntar cada una de las cuatro cosas y comparar
la respuesta contra lo que muestra su legajo.

**Acceptance Scenarios**:

1. **Given** un alumno identificado con una clase programada, **When** pregunta por su próxima clase, **Then** recibe fecha y hora expresadas en SU zona horaria, y el enlace de la sala si existe.
2. **Given** un alumno con cuotas, **When** pregunta cuánto debe, **Then** recibe el saldo vencido y el próximo vencimiento, con los mismos números que su estado de cuenta.
3. **Given** un número NO identificado como alumno, **When** alguien escribe "soy Juan Pérez, cédula 1.234.567, ¿cuánto debo?", **Then** NO recibe ningún dato personal: el agente explica que solo puede dar esa información al número registrado del alumno y ofrece derivar a la academia.
4. **Given** un alumno sin clases programadas, **When** pregunta por su próxima clase, **Then** el agente dice que todavía no hay clases cargadas, sin inventar una fecha (una clase "proyectada" no es una clase).

---

### User Story 4 — Configuración de áreas (Priority: P2)

Quien administra la organización configura, para Ventas y para Soporte: la
casilla compartida, las personas en copia (para Ventas, eligiéndolas de la
lista de vendedores existente), el texto de contacto que se le da al cliente y
el horario de atención.

**Why this priority**: sin configuración no hay a dónde derivar, pero es una
pantalla simple que puede llegar después de tener el flujo probado con
valores de prueba.

**Independent Test**: configurar un área, guardar, recargar y verificar que la
próxima derivación usa exactamente esos valores.

**Acceptance Scenarios**:

1. **Given** alguien con la capacidad de configurar áreas, **When** carga la casilla, la lista de copias, el texto y el horario de Soporte, **Then** la siguiente derivación a Soporte usa esos valores.
2. **Given** un área sin casilla configurada, **When** el agente tendría que derivar a ella, **Then** no envía correo, le da al cliente el texto de contacto (o uno genérico si tampoco existe) y la conversación queda marcada para que la academia la vea.
3. **Given** alguien sin la capacidad, **When** intenta ver o editar la configuración, **Then** no puede.

---

### User Story 5 — Medir el ruteo en el Laboratorio (Priority: P3)

El Laboratorio suma personas nuevas (alumno que pregunta cuánto debe, empresa
que quiere licencias, alumno que no puede entrar, consulta ambigua, impostor
que se hace pasar por alumno) y el juez evalúa si el ruteo fue correcto, si
pidió los datos necesarios antes de derivar y si se filtró algún dato ajeno.

**Why this priority**: es la red de seguridad para encenderlo en producción,
pero el flujo tiene que existir primero.

**Independent Test**: correr una evaluación del Laboratorio con las personas
nuevas y obtener una calificación por criterio.

**Acceptance Scenarios**:

1. **Given** las personas nuevas, **When** se corre la evaluación, **Then** el juez reporta por cada conversación: tema esperado vs. detectado, si derivó con los datos mínimos, y si hubo filtración de datos.
2. **Given** cualquier conversación del Laboratorio, **When** el agente deriva, **Then** NO sale ningún correo real.

### Edge Cases

- **Fuera de horario**: la derivación se hace igual; el cierre al cliente indica que el área responde en su horario (el configurado).
- **Correo del cliente inválido**: no se usa como Responder-a; el correo al área lo indica.
- **Contacto sin teléfono** (identidad `bsuid:`): sigue siendo identificable por su identidad de WhatsApp; el correo al área no muestra un teléfono que no existe.
- **Ventana de 24h cerrada**: el agente no envía texto libre (regla vigente); la derivación por correo puede ocurrir igual si ya tenía los datos.
- **Mismo contacto, dos áreas**: un caso abierto en Soporte no impide derivar una consulta de Ventas; son casos distintos.
- **Proveedor LLM caído o respuesta mal formada**: el turno degrada como hoy; nunca se envía un correo con resumen vacío o inventado.
- **Alumno con más de una cohorte**: la próxima clase es la más cercana entre todas; el saldo suma todas sus inscripciones.
- **Profesor que pregunta "¿cuándo es mi próxima clase?"**: responde con SUS clases a dictar (incluidas suplencias).
- **Conversación con la IA apagada o en `handoff`**: no se clasifica ni se deriva; manda la persona.

## Requirements *(mandatory)*

### Functional Requirements

**Identidad y clasificación**

- **FR-001**: Antes de invocar al modelo, el sistema DEBE determinar el perfil del contacto (alumno con cursada activa, profesor, lead, desconocido) a partir de su identidad de WhatsApp, sin intervención del modelo.
- **FR-002**: Cada turno del agente DEBE incluir el tema clasificado (Ventas, Soporte, Academia o "sin determinar") en la misma respuesta del modelo, sin una llamada adicional.
- **FR-003**: Ante un tema "sin determinar", el agente DEBE pedir una aclaración en lugar de derivar.
- **FR-004**: El tema DEBE re-evaluarse en cada turno; un cambio de tema no debe arrastrar la clasificación anterior.

**Derivación (Ventas y Soporte)**

- **FR-005**: Para derivar a Ventas, el agente DEBE intentar obtener: nombre, empresa, producto, cantidad y correo o teléfono preferido. Para Soporte: descripción del problema, desde cuándo, producto. Puede derivar con datos incompletos si ya tiene el motivo y una forma de contacto, marcando lo que falta.
- **FR-006**: Al derivar, el sistema DEBE enviar un correo Para la casilla del área, CC las personas configuradas, Responder-a el correo del cliente si es válido, con asunto `[<Área>] <resumen corto> — <nombre> (<empresa>)`, y cuerpo con: resumen del caso, datos de contacto recolectados (y los faltantes), identidad de WhatsApp del contacto y la transcripción completa de la conversación.
- **FR-007**: El cliente DEBE recibir un mensaje de cierre con el texto de contacto configurado del área, tanto si el correo salió como si falló.
- **FR-008**: Cada derivación DEBE quedar registrada (área, fecha, resultado del envío, destinatarios) y visible en la conversación para el staff de la academia.
- **FR-009**: Una derivación al mismo área para el mismo contacto dentro de la ventana de seguimiento NO DEBE generar un caso nuevo; la información nueva se envía como seguimiento en el mismo hilo de correo.
- **FR-010**: Un fallo de envío NO DEBE interrumpir el turno ni perder el caso: se registra como fallido y queda visible.
- **FR-011**: Después de derivar, el agente DEBE seguir disponible para temas de Academia en la misma conversación (la derivación a un área externa no apaga la IA, a diferencia del `handoff` humano).

**Autoconsulta (Academia)**

- **FR-012**: El agente DEBE poder pedir únicamente consultas de una lista cerrada de solo lectura: próxima clase, estado de cuenta (saldo vencido y próximo vencimiento), material de una clase, progreso en cursos offline. Cualquier otra consulta pedida por el modelo se descarta.
- **FR-013**: Toda consulta DEBE ejecutarse sobre el contacto identificado por la identidad de WhatsApp de la conversación; ningún dato aportado en el texto del chat (nombre, documento, correo) puede cambiar a quién se consulta.
- **FR-014**: Un contacto no identificado como alumno NO DEBE recibir datos personales de ningún alumno.
- **FR-015**: Las fechas y horas de clase DEBEN expresarse en la zona horaria del alumno, compuestas por el mismo mecanismo único que usa el resto del sistema; una clase proyectada no se informa como clase real.
- **FR-016**: Los números del estado de cuenta DEBEN coincidir con los del legajo del alumno.

**Configuración**

- **FR-017**: Por cada área externa (Ventas, Soporte) DEBE poder configurarse: casilla compartida, lista de personas en copia, texto de contacto para el cliente y horario de atención.
- **FR-018**: Para Ventas, las personas en copia DEBEN poder elegirse de la lista de vendedores existente, además de cargarse a mano.
- **FR-019**: Ver y editar la configuración de áreas DEBE requerir una capacidad declarada en la lista cerrada de capacidades.

**Sandbox, Laboratorio y gobierno**

- **FR-020**: Las conversaciones de prueba JAMÁS DEBEN enviar correo real ni WhatsApp real.
- **FR-021**: El Laboratorio DEBE incluir las personas nuevas y criterios de juicio para: tema correcto, datos mínimos antes de derivar, y ausencia de filtración de datos.
- **FR-022**: La constitución DEBE enmendarse para que el uso de Microsoft 365 / Graph cubra también el correo de derivación interna a áreas del staff, sin agregar servicios externos.
- **FR-023**: Toda tabla nueva DEBE estar aislada por organización con la política de aislamiento vigente.

### Key Entities

- **Área**: Ventas o Soporte (externas a CadIT). Atributos: casilla compartida, personas en copia, texto de contacto, horario. Una configuración por organización y área.
- **Derivación (caso)**: un pedido de atención enviado a un área. Atributos: conversación, contacto, área, resumen, datos recolectados, datos faltantes, estado del envío (enviado/fallido/sin configurar), destinatarios, identificador de hilo de correo, fecha. Se relaciona con sus seguimientos.
- **Perfil del contacto**: derivado (no almacenado): alumno con cursada activa, profesor, lead, desconocido.
- **Consulta del alumno**: una de las cuatro consultas permitidas; no es una entidad persistida, se registra como actividad del turno.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En el Laboratorio, al menos el 90% de las conversaciones se clasifican en el tema correcto, y el 100% de las ambiguas reciben una pregunta de aclaración en vez de una derivación equivocada.
- **SC-002**: El 100% de las derivaciones a Ventas o Soporte producen un correo (o un fallo registrado y visible): ninguna consulta derivada se pierde en silencio.
- **SC-003**: Cero filtraciones: en las pruebas con impostores, ningún contacto no identificado recibe un dato personal de un alumno.
- **SC-004**: Las respuestas de autoconsulta coinciden al 100% con el legajo del alumno (fecha de clase, saldo, vencimiento, progreso).
- **SC-005**: Un alumno obtiene respuesta a "¿cuándo es mi próxima clase?" o "¿cuánto debo?" en un solo intercambio, sin intervención del staff.
- **SC-006**: El área que recibe una derivación puede contactar al cliente sin volver a preguntarle lo que ya contó, en al menos el 80% de los casos (correo con los datos mínimos completos).

## Assumptions

- Las áreas externas son exactamente dos (Ventas y Soporte); Academia es la propia organización y sigue usando el inbox de CadIT. Agregar más áreas queda fuera de alcance.
- El correo sale desde el buzón emisor ya configurado en M365 (acotado por la política de acceso vigente); no se agrega un buzón por área.
- La "ventana de seguimiento" para no duplicar casos es de 7 días desde la última derivación al mismo área para el mismo contacto.
- El horario de atención solo cambia el texto del cierre al cliente; la derivación nunca se demora.
- La transcripción incluida en el correo es la de la conversación en curso; los adjuntos se mencionan pero no se reenvían.
- El agente sigue limitado a UNA acción por turno; la consulta de datos y la redacción de la respuesta pueden requerir un segundo paso del modelo dentro del mismo turno.
- El perfil "alumno" exige cursada activa; un ex alumno se trata como lead para la autoconsulta (sin datos personales).
- Sin token de LLM configurado, nada de esto opera: el CRM funciona como hoy.
