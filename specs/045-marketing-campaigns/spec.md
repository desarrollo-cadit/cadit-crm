# Feature Specification: Marketing — campañas por correo (etapa 1)

**Feature Branch**: `045-marketing-campaigns`

**Created**: 2026-10-22

**Status**: Aprobada — retomada por el dueño el 2026-10-22; constitución
enmendada a 1.8.0.

**Input**: User description: "Sección de Marketing: campañas por correo a audiencias construidas con filtros (origen, etapa del pipeline, grupo o curso, curso de interés, empresa, fecha de alta), editor con vista previa y envío de prueba, bajas que toda campaña futura respeta, página de campañas con destinatarios y métricas (enviados, fallidos, bajas, clics). Envío por Microsoft 365 desde un buzón de marketing separado, de a uno, cientos de destinatarios por campaña. WhatsApp, HTML libre y aperturas quedan fuera de esta etapa."

## Contexto

Hoy los leads que no se convirtieron (etapa "perdido") y los exalumnos quedan en
la base sin forma de volver a contactarlos en conjunto. Para ofrecerles un curso
nuevo o una nueva edición, el equipo escribe uno por uno fuera del CRM. Esta
etapa permite armar una audiencia con criterios de negocio, redactar un correo
con la marca y enviarlo, respetando siempre a quien pidió no recibir más
comunicaciones y dejando registro de qué se envió a quién.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Armar una audiencia y ver a quién llegaría (Priority: P1)

Una persona de Ventas o Marketing quiere volver a contactar a los leads
perdidos que llegaron por el formulario "Landing Revit". Elige los filtros
(origen = ese formulario, etapa = perdido) y ve al instante cuántas personas
cumplen y quiénes son. Ve también cuántas quedaron afuera y por qué: se dieron
de baja, no tienen correo o están archivadas. Guarda la audiencia como
"Perdidos Landing Revit" para usarla en otras campañas.

**Why this priority**: sin una audiencia correcta no hay campaña posible, y el
mayor riesgo del negocio es mandarle algo a quien no corresponde. Por sí sola
ya da valor: permite contar y listar segmentos que hoy no se pueden ver.

**Independent Test**: crear una audiencia con dos filtros combinados sobre datos
conocidos y comprobar que la cantidad, la lista y los excluidos por motivo
coinciden con lo esperado.

**Acceptance Scenarios**:

1. **Given** 10 contactos que llegaron por "Landing Revit", 6 de ellos en etapa
   "perdido", **When** se combinan los filtros origen = "Landing Revit" y
   etapa = "perdido", **Then** la audiencia muestra 6 personas con nombre y correo.
2. **Given** que de esos 6 uno se dio de baja y otro no tiene correo, **When** se
   ve la audiencia, **Then** muestra 4 destinatarios y "2 excluidos: 1 dado de
   baja, 1 sin correo".
3. **Given** el grupo "Revit Arquitectura 4" con 12 alumnos, **When** se filtra
   por ese grupo, **Then** la audiencia incluye a los 12 (menos los excluidos),
   hayan terminado o no.
4. **Given** una audiencia guardada, **When** al día siguiente entra un lead nuevo
   que cumple los filtros, **Then** la audiencia lo incluye: los filtros se
   evalúan cada vez, no son una foto.

---

### User Story 2 - Redactar el correo y verlo antes de enviar (Priority: P1)

La persona redacta el asunto y el cuerpo con formato (negritas, enlaces,
imágenes y un botón), usa variables como el nombre del destinatario, ve la vista
previa tal como la recibiría un contacto real de la audiencia y se manda una
prueba a su propio correo.

**Why this priority**: un correo con errores llega a cientos de personas y no se
puede deshacer. La vista previa y la prueba son la barrera antes del envío.

**Independent Test**: redactar un correo con variables, abrir la vista previa
con dos contactos distintos y comprobar que cada uno ve su nombre; enviar una
prueba y recibirla.

**Acceptance Scenarios**:

1. **Given** un cuerpo que dice "Hola {{nombre}}", **When** se previsualiza con
   el contacto "Ana Pérez", **Then** se lee "Hola Ana".
2. **Given** un contacto sin el dato que pide una variable, **When** se
   previsualiza, **Then** la variable se reemplaza por un texto alternativo
   definido y nunca aparece la llave cruda ("{{curso}}").
3. **Given** un correo listo, **When** se envía una prueba, **Then** llega solo a
   la persona que la pidió, marcada como prueba, y no cuenta como envío de la
   campaña.
4. **Given** el editor, **When** se intenta pegar código HTML, **Then** se
   conserva solo el formato permitido; no se ejecuta ni se guarda código.

---

### User Story 3 - Enviar la campaña y seguir el resultado (Priority: P1)

La persona elige la audiencia, confirma ("Se enviará a 214 personas") y la
campaña sale de a un correo por vez desde el buzón de marketing. Mientras tanto
puede seguir usando el sistema. Luego abre la página de la campaña y ve la
tabla de destinatarios con su estado (enviado, falló y por qué, se dio de baja)
y las métricas: enviados, fallidos, bajas y clics.

**Why this priority**: es el resultado que el dueño pidió. Las historias 1 y 2
solo tienen sentido si el envío existe.

**Independent Test**: enviar una campaña a una audiencia de prueba, comprobar
que cada destinatario recibe un solo correo, que la tabla refleja enviados y
fallidos, y que hacer clic en un enlace suma un clic.

**Acceptance Scenarios**:

1. **Given** una audiencia de 214 personas, **When** se confirma el envío,
   **Then** se envía un correo a cada una, una sola vez, y la campaña pasa a
   "enviando" y después a "enviada".
2. **Given** una campaña enviándose, **When** una persona se da de baja en ese
   momento por otra campaña, **Then** no recibe esta si todavía no le había
   salido.
3. **Given** un destinatario cuyo correo falla, **When** termina la campaña,
   **Then** figura como "falló" con el motivo, y el resto se envió igual.
4. **Given** un destinatario que hace clic en el botón del correo, **When** se
   abre la campaña, **Then** el contador de clics suma uno y ese destinatario
   figura como "hizo clic", y el enlace lo lleva a su destino real.
5. **Given** un envío interrumpido (reinicio del servidor), **When** se reanuda,
   **Then** continúa con quienes faltaban y nadie recibe dos veces el mismo correo.

---

### User Story 4 - Darse de baja y que se respete siempre (Priority: P1)

Quien recibe una campaña hace clic en "No quiero recibir más correos" y ve una
página que confirma la baja, sin iniciar sesión. Desde ese momento ninguna
campaña futura le llega, aunque cumpla los filtros. En su ficha del CRM se ve
la baja con la fecha y la campaña desde la que la pidió. Los correos operativos
(bienvenida, cuotas, acceso al portal) le siguen llegando.

**Why this priority**: es una obligación legal (Ley 18.331) y protege la
reputación del remitente. Sin bajas la funcionalidad no se puede lanzar.

**Independent Test**: darse de baja desde el enlace de un correo de prueba,
comprobar que la ficha lo muestra, que una audiencia nueva lo excluye y que un
correo operativo le sigue llegando.

**Acceptance Scenarios**:

1. **Given** un correo de campaña, **When** el destinatario abre el enlace de
   baja, **Then** ve la confirmación y la baja queda registrada con fecha y
   campaña de origen.
2. **Given** un enlace de baja alterado o de otra persona, **When** se abre,
   **Then** no da de baja a nadie y no revela de quién es.
3. **Given** un contacto dado de baja, **When** se arma cualquier audiencia,
   **Then** figura entre los excluidos "dado de baja" y no recibe la campaña.
4. **Given** un contacto dado de baja, **When** el sistema le envía el correo de
   bienvenida a un grupo, **Then** le llega igual.
5. **Given** un contacto que pidió la baja por error, **When** una persona del
   equipo con el permiso correspondiente lo reactiva desde su ficha, **Then**
   queda registrado quién y cuándo, y vuelve a ser elegible.

---

### User Story 5 - Configurar el buzón de marketing y el diseño base (Priority: P2)

Una persona con permiso de configuración indica desde qué buzón salen las
campañas (por ejemplo, novedades@cadit.uy), el nombre que ve el destinatario y
los datos del pie (dirección de la academia, contacto). Prueba que el buzón
funciona antes de usarlo.

**Why this priority**: necesario para enviar, pero se configura una sola vez y
puede arrancar con valores razonables.

**Independent Test**: cargar un buzón, probar el envío de un correo de control y
ver el resultado; con el buzón sin configurar, el botón de enviar explica qué
falta.

**Acceptance Scenarios**:

1. **Given** el buzón de marketing sin configurar, **When** se quiere enviar una
   campaña, **Then** no se puede y el mensaje dice dónde configurarlo.
2. **Given** un buzón al que el sistema no tiene permiso de enviar, **When** se
   prueba, **Then** se informa el error de forma comprensible y no se guarda
   como válido.

---

### Edge Cases

- Una misma persona cumple los filtros por dos caminos (fue alumna de dos
  grupos): recibe un solo correo.
- Dos contactos con el mismo correo (por datos viejos): el correo se envía una
  sola vez por dirección.
- La audiencia supera el tope de 500 destinatarios (FR-018): no se permite
  enviar y se sugiere acotar los filtros.
- Se edita la campaña mientras se envía: no se puede; una campaña enviada o en
  curso es de solo lectura.
- Se borra un contacto que estaba en una campaña enviada: la campaña conserva
  el registro de que se le envió (correo y fecha), sin depender del contacto.
- Un enlace del correo apunta a una dirección inválida o insegura: no se permite
  guardar la campaña.
- El buzón de marketing alcanza el límite del proveedor a mitad del envío: el
  envío se pausa y se reanuda solo, sin perder ni duplicar destinatarios.
- Un contacto archivado se reactiva: vuelve a ser elegible, salvo que esté dado
  de baja.
- La organización no tiene ningún formulario, grupo o empresa: los filtros
  correspondientes se muestran vacíos sin errores.
- Un correo de prueba nunca suma a las métricas ni marca a nadie como
  destinatario.

## Requirements *(mandatory)*

### Functional Requirements

**Audiencias**

- **FR-001**: El sistema MUST permitir definir una audiencia combinando estos
  filtros (todos opcionales, combinados con "y"; dentro de un mismo filtro, varios
  valores se combinan con "o"):
  - origen del contacto (formulario o captación específica, WhatsApp, taller)
  - etapa del pipeline, incluida la etapa "perdido"
  - grupo en el que estuvo inscripto
  - curso al que pertenecen sus grupos
  - curso de interés
  - empresa
  - rango de fecha de alta
- **FR-002**: El sistema MUST mostrar, antes de enviar, la cantidad de
  destinatarios y la lista con nombre y correo.
- **FR-003**: El sistema MUST excluir siempre, y mostrar cuántos por motivo, a
  quienes: se dieron de baja de marketing, no tienen correo válido o están
  archivados.
- **FR-004**: El sistema MUST deduplicar por dirección de correo: una dirección
  recibe un solo correo por campaña.
- **FR-005**: Las audiencias MUST poder guardarse con un nombre y reutilizarse;
  se evalúan en el momento de usarse, no al guardarse.
- **FR-006**: Al enviar, el sistema MUST congelar la lista de destinatarios de
  esa campaña: lo que cambie después en la audiencia no altera a quién se le
  envió.

**Contenido**

- **FR-007**: El correo MUST tener asunto y cuerpo con formato limitado
  (títulos, negrita, cursiva, listas, enlaces, imágenes y botones), dentro de un
  diseño base con la marca de la academia.
- **FR-007a**: Las imágenes MUST poder subirse desde el editor y guardarse en el
  almacenamiento propio del sistema, igual que las demás imágenes que ya guarda
  (por ejemplo, las de los talleres). Se aceptan solo formatos de imagen
  comunes, con un tamaño máximo por archivo.
- **FR-007b**: Una imagen subida MUST poder verse desde el correo del
  destinatario sin iniciar sesión, en una dirección imposible de adivinar, y
  MUST seguir disponible mientras exista la campaña que la usa.
- **FR-008**: El sistema MUST soportar variables de personalización
  (al menos nombre, apellido y curso de interés), con un texto alternativo cuando
  el dato falta. Una variable desconocida MUST impedir guardar la campaña.
- **FR-009**: El sistema MUST ofrecer vista previa con cualquier contacto real de
  la audiencia, y envío de prueba a la dirección de quien lo pide.
- **FR-010**: El sistema MUST NOT aceptar HTML libre en esta etapa; lo pegado se
  reduce al formato permitido.
- **FR-011**: Todo correo de campaña MUST incluir el enlace de baja y la
  identificación del remitente (nombre de la academia y dato de contacto en el
  pie). No se puede quitar.

**Bajas**

- **FR-012**: El enlace de baja MUST funcionar sin iniciar sesión, ser propio de
  cada destinatario e imposible de adivinar o reutilizar para dar de baja a otra
  persona.
- **FR-013**: La baja MUST registrarse en el contacto con fecha y campaña de
  origen, verse en su ficha, y aplicarse a todas las campañas futuras y a las
  que estén enviándose.
- **FR-014**: La baja de marketing MUST NOT afectar los correos operativos
  (bienvenida, cuotas, acceso al portal, avisos de licencia).
- **FR-015**: Una persona con permiso MUST poder revertir una baja desde la ficha
  del contacto, con registro de quién y cuándo.

**Envío**

- **FR-016**: Las campañas MUST enviarse desde el buzón de marketing configurado,
  distinto del buzón de los correos operativos, de a un correo por vez, sin
  bloquear el uso del sistema.
- **FR-017**: El envío MUST ser idempotente: ante una interrupción, reanuda con
  los destinatarios pendientes y nadie recibe el mismo correo dos veces.
- **FR-018**: Una campaña MUST tener un tope de 500 destinatarios, para
  mantenerse holgadamente dentro de los límites del proveedor de correo.
- **FR-019**: Antes de enviar, el sistema MUST pedir confirmación indicando la
  cantidad exacta de destinatarios; un envío confirmado no se puede deshacer.
- **FR-020**: Una campaña MUST poder cancelarse mientras se envía; los pendientes
  no reciben el correo.

**Resultados**

- **FR-021**: El sistema MUST listar las campañas con nombre, estado (borrador,
  enviando, enviada, cancelada), fecha, audiencia y cantidad de destinatarios.
- **FR-022**: El detalle de una campaña MUST mostrar la tabla de destinatarios
  (nombre, correo, estado: pendiente, enviado, falló con motivo; si se dio de
  baja desde esta campaña; si hizo clic) y las métricas: enviados, fallidos,
  bajas y clics (total y personas únicas).
- **FR-023**: Los enlaces del correo MUST pasar por el sistema para registrar el
  clic y redirigir al destino real. Solo se redirige a los destinos que la
  campaña contiene (nunca a una dirección arbitraria).
- **FR-024**: Las aperturas NO se miden en esta etapa.

**Permisos y datos**

- **FR-025**: El acceso MUST regirse por capacidades nuevas: ver campañas y
  audiencias (`marketing.ver`), crear y enviar campañas (`marketing.enviar`) y
  configurar el buzón y el diseño (ajustes de marketing). Nunca por nombre de
  rol.
- **FR-026**: Todos los datos de esta funcionalidad MUST pertenecer a una
  organización y quedar aislados de las demás, como el resto del sistema.
- **FR-027**: Las conversaciones y contactos de prueba del Laboratorio MUST NOT
  recibir campañas.

### Key Entities

- **Audiencia**: nombre y conjunto de filtros guardados; se evalúa al usarse.
- **Campaña**: nombre, asunto, cuerpo, audiencia de origen, estado, quién la creó
  y la envió, fechas; de solo lectura una vez enviada.
- **Destinatario de campaña**: la foto de a quién se le envía (contacto, correo y
  nombre al momento del envío), su estado, motivo de falla, fecha de envío, si
  hizo clic y si se dio de baja desde esta campaña.
- **Baja de marketing**: el contacto, la fecha, la campaña de origen y, si se
  revirtió, quién y cuándo.
- **Clic**: destinatario, enlace y fecha.
- **Configuración de marketing**: buzón emisor, nombre del remitente y datos del
  pie, por organización.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona arma una audiencia con dos filtros y ve su tamaño y la
  lista en menos de 1 minuto, sin ayuda.
- **SC-002**: Una campaña de 500 destinatarios (el tope) termina de enviarse en menos de
  30 minutos y el sistema sigue usable durante el envío.
- **SC-003**: El 100% de los correos de campaña lleva enlace de baja, y ninguna
  persona dada de baja recibe una campaña posterior.
- **SC-004**: Ningún destinatario recibe dos veces el mismo correo de una
  campaña, aun con interrupciones del envío.
- **SC-005**: La baja de marketing no impide la llegada de ningún correo
  operativo.
- **SC-006**: El equipo deja de contactar a mano, fuera del CRM, a los leads
  perdidos y exalumnos para ofrecer cursos nuevos.

## Assumptions

- **Volumen**: cientos de destinatarios por campaña, no miles; con ese volumen el
  proveedor de correo actual alcanza.
- **Buzón**: la academia crea un buzón compartido de marketing en Microsoft 365
  y lo habilita para que el CRM envíe desde él.
- **Formato**: alcanza con texto con formato, imágenes subidas y botones; el
  diseño base se define una vez con la marca.
- **Imágenes**: se suben desde el editor y quedan en el almacenamiento propio
  del servidor, sin servicios externos de alojamiento.
- **Consentimiento**: los contactos llegaron por formularios o como alumnos, y la
  academia asume la base legal para escribirles; la baja garantiza el derecho a
  oponerse (Ley 18.331).
- **Fuera de alcance**: plantillas de WhatsApp (etapa futura sobre las mismas
  audiencias), HTML libre, medición de aperturas, programar envíos a futuro y
  pruebas A/B.

## Dependencies

- **Enmienda de la constitución (requisito previo; APROBADA el 2026-10-22 y
  redactada como 1.8.0)**: antes de 1.8.0 el Principio II
  permite usar Microsoft 365 solo para correo transaccional a alumnos y
  profesores y para avisos internos, y el Principio VIII declara que el producto
  "no es plataforma de marketing masivo". Esta funcionalidad requiere una
  enmienda MINOR que (a) amplíe el uso de Microsoft 365 a campañas de correo a
  contactos propios del negocio, con baja obligatoria y tope por campaña, y
  (b) acote el Principio VIII: campañas segmentadas a contactos propios para
  convertir leads y exalumnos sí; difusión masiva a terceros no.
- **Política de acceso del buzón**: la restricción de Exchange que acota desde
  qué buzones puede enviar el CRM tiene que incluir el buzón de marketing.
- **Motor de envíos existente**: se reutiliza el envío de a uno con registro por
  destinatario que ya usan los envíos al grupo.
