# Feature Specification: Certificados en PDF con el diseño de la academia

**Feature Branch**: `038-certificados-pdf`

**Created**: 2026-10-16

**Status**: Draft

**Depende de**: 010 (evaluación y certificados), 024 (anulación), 028 (especializaciones), 032 (tipos de curso)

**Input**: Pedido del dueño (2026-10-16): "Planifiquemos la entrega de certificados. Tengo el diseño. Una vez que termina el curso y hayan entregado todo, el que tenga el rol puede aprobar el certificado y el alumno lo ve en su plataforma. En una especialización hay dos casos: si aprueba todo, se le entrega un certificado con el nombre del curso (no la cohorte) y también los de los módulos; si no aprobó todo, solo los de los módulos que aprobó." Ejemplos entregados: `eBIM_diplomas_Noelia_Sosa.pdf` (aprobó todo) y `eBIM_diplomas_Luis_Gonzalez_Susperreguy.pdf` (aprobó 3 de 4 módulos). Plantillas entregadas: `Plantilla Especialización Vertical.pdf`, `Plantilla Especialización Horizontal.pdf`, `Plantilla Curso Horizontal.pdf`.

## Por qué esta fase existe

El sistema ya **decide** bien quién tiene certificado (010, 028): un curso se
certifica con la asistencia mínima y las evaluaciones obligatorias
aprobadas; el general de una especialización exige todos los módulos
aprobados; cada módulo aprobado tiene el suyo. Hay emisión, anulación con
motivo y una página pública de verificación por código.

Lo que falta es **el certificado mismo**. Hoy "Ver y compartir" abre una
página web; no hay un documento con el diseño de la academia, que es lo que
la persona imprime, adjunta o comparte. Y hay cuatro huecos en la emisión:

1. Los 4 cursos de tipo *módulo* de producción tienen "otorga certificado"
   apagado (default elegido en 032, equivocado): hoy un módulo aprobado **no**
   se podría certificar.
2. Se puede emitir antes de que el curso termine.
3. Se emite de a uno.
4. Un módulo no tiene dónde guardar el párrafo que describe lo aprendido, que
   el diseño muestra.

Al 2026-10-16 **no hay ningún certificado emitido**: no hay nada viejo que
migrar ni que re-generar.

## Los tres formatos (del diseño entregado)

| Formato | Plantilla | Cuándo | Contenido variable |
|---|---|---|---|
| Especialización completa | Vertical (A4) | Aprobó todos los módulos | Nombre del curso, año, nombre del alumno, "Ha completado exitosamente la totalidad del curso", lista de módulos con tilde |
| Módulo | Horizontal (A4 apaisado) | Aprobó ese módulo | Nombre del curso de la especialización, año, nombre del alumno, "Ha completado exitosamente el módulo I/II/III…", nombre del módulo, descripción del módulo |
| Curso | Horizontal (A4 apaisado) | Aprobó un curso común | Nombre del curso, año, nombre del alumno, "Ha completado exitosamente el curso", descripción del curso |

Las plantillas ya traen lo fijo: formas, "CERTIFICACIÓN", logos de CAD IT y
de Autodesk Authorized Training Center, firmas con nombre y cargo, y el pie
con los ID del centro y la dirección. La de curso lleva solo la firma del
Director (decisión del diseño).

Tipografías: **Poppins** (títulos y textos, como el diseño) y **Parisienne**
(nombre del alumno; reemplaza a Paradise Signature, ver Assumptions).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El alumno descarga su certificado con el diseño (Priority: P1)

Noelia aprobó toda la Especialización en Proyectos BIM. En su Campus, en Mis
certificados, ve el certificado general y los cuatro de sus módulos, y
descarga cada uno en PDF con el diseño de la academia. Luis aprobó tres de
cuatro módulos: ve y descarga los tres certificados de módulo, y no tiene
general.

**Why this priority**: Es el entregable. Sin el documento, el certificado no
existe para la persona.

**Independent Test**: Emitir el general y los módulos para un alumno que
aprobó todo, y solo módulos para uno que no; desde el portal de cada uno,
descargar y verificar el formato, los textos y que la cantidad coincide.

**Acceptance Scenarios**:

1. **Given** un certificado general emitido, **When** el alumno lo descarga,
   **Then** obtiene un PDF vertical con el nombre del **curso** (no de la
   cohorte), el año, su nombre completo tal como figura en el CRM, la frase
   "Ha completado exitosamente la totalidad del curso" y la lista de los
   módulos del programa, en orden.
2. **Given** un certificado de módulo emitido, **When** se descarga,
   **Then** obtiene un PDF horizontal con el nombre del curso de la
   especialización, el año, su nombre, "Ha completado exitosamente el módulo"
   y el número del módulo en romanos, el nombre del módulo y su descripción.
3. **Given** un certificado de un curso común, **When** se descarga,
   **Then** obtiene un PDF horizontal con el nombre del curso, el año, su
   nombre, "Ha completado exitosamente el curso" y la descripción del curso.
4. **Given** un certificado anulado, **When** el alumno entra a Mis
   certificados, **Then** lo ve como anulado y no puede descargarlo.
5. **Given** un PDF de certificado, **When** se mira el pie, **Then** tiene el
   código del certificado y la dirección de verificación pública, para que
   cualquiera compruebe que es real.

---

### User Story 2 - Emitir certificados de una cohorte (Priority: P1)

Terminado el curso, quien tiene el permiso de emitir certificados entra a la
cohorte y aprieta **"Emitir a todos los aprobados"**. El sistema emite los de
quienes aprobaron, y dice a quiénes no y por qué. También puede emitir de a
uno, como hoy.

**Why this priority**: Una cohorte de 16 alumnos no se emite de a uno.

**Independent Test**: Con una cohorte terminada con aprobados y no
aprobados, emitir a todos y verificar que solo los aprobados quedan con
certificado y que el resto aparece con su motivo.

**Acceptance Scenarios**:

1. **Given** una cohorte terminada, **When** se emite a todos los aprobados,
   **Then** cada aprobado queda con su certificado y la pantalla lista a los
   no aprobados con el motivo.
2. **Given** una cohorte que todavía no terminó, **When** se intenta emitir,
   **Then** no se emite y se indica la fecha de finalización.
3. **Given** alumnos con certificado ya emitido, **When** se emite a todos
   otra vez, **Then** no se duplica ninguno.
4. **Given** una especialización, **When** se emite a todos desde la
   especialización, **Then** se emiten los certificados de cada módulo
   aprobado y el general de quienes aprobaron todo; quien no aprobó todo
   recibe solo los de sus módulos aprobados.
5. **Given** una persona sin el permiso de emitir, **When** abre la cohorte,
   **Then** no ve las acciones de emisión.

---

### User Story 3 - Configurar el certificado de cada curso y módulo (Priority: P2)

Al editar un curso o un módulo, la coordinación carga la **descripción para
el certificado** (el párrafo que en el ejemplo de Luis describe lo aprendido
en el módulo). Desde ahí puede **ver una vista previa** del PDF con datos de
ejemplo.

**Why this priority**: Sin descripción el certificado sale igual, sin ese
párrafo; con ella sale completo.

**Independent Test**: Cargar la descripción de un módulo, abrir la vista
previa y verificar que el párrafo aparece; borrarla y verificar que el
certificado sale sin el párrafo y sin un hueco.

**Acceptance Scenarios**:

1. **Given** un módulo con descripción, **When** se genera su certificado,
   **Then** la descripción aparece debajo del nombre del módulo.
2. **Given** un módulo sin descripción, **When** se genera, **Then** sale sin
   párrafo y el diseño no deja un espacio vacío raro.
3. **Given** un texto largo, **When** se genera, **Then** se acomoda en el
   espacio del diseño sin salirse ni pisar las firmas; si no entra, el
   sistema avisa al cargarlo.
4. **Given** la vista previa, **When** se la abre, **Then** muestra el PDF real
   con un nombre de ejemplo y el texto cargado.

---

### User Story 4 - Corregir la emisión de los módulos (Priority: P1)

Los módulos de especialización otorgan certificado. Los que hoy lo tienen
apagado se encienden, y "Módulo nuevo" lo crea encendido.

**Why this priority**: Sin esto, US1 y US2 no funcionan para las
especializaciones, que son el caso que motivó la fase.

**Independent Test**: Verificar que los cursos de tipo módulo existentes
otorgan certificado después del despliegue, y que uno creado con "Módulo
nuevo" también.

**Acceptance Scenarios**:

1. **Given** cursos de tipo módulo con "otorga certificado" apagado,
   **When** se despliega, **Then** quedan encendidos.
2. **Given** "Módulo nuevo", **When** se crea, **Then** el curso del módulo
   otorga certificado.
3. **Given** un curso común con "otorga certificado" apagado a propósito,
   **When** se despliega, **Then** no se toca.

---

### Edge Cases

- **Nombre muy largo** (dos apellidos y dos nombres): se achica dentro del
  ancho del diseño, nunca se corta ni se sale.
- **Nombre del curso largo**: hasta dos líneas, como en el ejemplo
  ("ESPECIALIZACIÓN / EN PROYECTOS BIM").
- **Especialización con 6 módulos**: la lista del vertical entra o se achica;
  nunca pisa las firmas.
- **Tildes y eñes** (Ñ, Á, Ü): se ven bien en las dos tipografías.
- **Año**: el de la fecha de inicio de la cohorte de la especialización o del
  curso; un programa que cruza dos años muestra el de inicio, como en los
  ejemplos ("EBIM 13", 2025).
- **Certificado emitido y después cambiado el nombre del alumno o del
  curso**: el PDF se genera con los datos congelados al emitir (los que
  figuran en la verificación), no con los de hoy.
- **Histórico** (010, DV-004): un certificado histórico se genera con el
  mismo diseño.
- **Anulado**: no se descarga ni desde el portal ni desde el panel; la
  verificación dice "anulado".

## Requirements *(mandatory)*

### Functional Requirements

**Documento**

- **FR-001**: El sistema MUST generar el PDF de cada certificado emitido a
  partir de la plantilla que corresponde a su formato (especialización
  completa, módulo o curso), escribiendo encima solo el contenido variable.
- **FR-002**: El general de una especialización MUST mostrar el nombre del
  **curso** de la especialización, nunca el de la cohorte.
- **FR-003**: El certificado de módulo MUST mostrar el número del módulo en
  números romanos según su posición en el programa.
- **FR-004**: El nombre del alumno MUST ser el nombre completo del contacto
  tal como quedó al emitir, en la tipografía manuscrita del diseño.
- **FR-005**: El texto variable MUST acomodarse al espacio del diseño
  (achicarse o partirse en líneas) sin salirse de la página ni superponerse a
  las firmas, logos o pie.
- **FR-006**: El PDF MUST incluir el código del certificado y la dirección de
  verificación pública, de forma discreta, sin alterar el diseño.
- **FR-007**: Un certificado anulado MUST NOT poder descargarse.

**Emisión**

- **FR-008**: Emitir MUST exigir que la cohorte haya terminado (fecha de fin
  pasada), además de las condiciones que ya existen.
- **FR-009**: La cohorte MUST ofrecer "Emitir a todos los aprobados", que
  emite a cada aprobado sin duplicar y lista a los no aprobados con su
  motivo.
- **FR-010**: En una especialización, emitir a todos MUST emitir los
  certificados de cada módulo aprobado de cada alumno y el general de quienes
  aprobaron todos los módulos.
- **FR-011**: Emitir MUST seguir exigiendo la capacidad de emitir
  certificados que ya existe.

**Datos del certificado**

- **FR-012**: Cada curso MUST poder tener una descripción para el
  certificado, opcional, con un largo máximo que entre en el diseño.
- **FR-013**: La edición del curso MUST ofrecer una vista previa del
  certificado con datos de ejemplo.
- **FR-014**: Los cursos de tipo módulo MUST otorgar certificado; los que hoy
  no lo hacen MUST encenderse al desplegar, y "Módulo nuevo" MUST crearlos
  encendidos. Los cursos comunes MUST NOT cambiar.

**Acceso**

- **FR-015**: El alumno MUST poder descargar sus certificados vigentes desde
  Mis certificados; el staff con acceso al legajo MUST poder descargarlos
  también.
- **FR-016**: La descarga MUST verificar que el certificado es de quien lo
  pide (alumno) o que quien lo pide tiene acceso (staff); un certificado
  ajeno MUST responder como inexistente.
- **FR-017**: Toda lectura MUST quedar aislada por organización.

### Key Entities *(include if feature involves data)*

- **Certificado** (sin cambios de forma): ya guarda código, fecha, curso,
  cohorte y el estado de anulación; suma lo necesario para regenerar el PDF
  con los datos del momento de la emisión.
- **Curso** (cambia): suma la descripción para el certificado.
- **Plantilla de certificado**: los tres PDF del diseño, versionados con el
  producto.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Los PDF generados para Noelia (general + 4 módulos) y para Luis
  (3 módulos) coinciden con los ejemplos entregados en formato, textos y
  ubicación de cada elemento.
- **SC-002**: Emitir los certificados de una cohorte de 16 alumnos es una
  sola acción.
- **SC-003**: Cero certificados emitidos antes de la fecha de fin de su
  cohorte.
- **SC-004**: Todo certificado descargado se puede verificar con su código.
- **SC-005**: Ningún módulo aprobado queda sin poder certificarse por la
  configuración de su curso.

## Assumptions

- **Las plantillas traen las firmas.** Si cambia un firmante, se reemplaza la
  plantilla; no hay configuración de firmantes en esta fase.
- **La plantilla de curso lleva solo la firma del Director**, como el diseño
  entregado.
- **Tipografía manuscrita: Parisienne** (Google Fonts, OFL), elegida por el
  dueño el 2026-10-16. El archivo de Paradise Signature entregado tiene 99
  glifos y ninguno acentuado (á, é, í, ó, ú, ñ, ü): "Sofía" o "Núñez" se
  romperían, y no vino con licencia de uso comercial.
- **El PDF se genera al pedirlo** con los datos congelados al emitir; no se
  guardan archivos (sin almacenamiento externo, constitución II).
- **No se envía el certificado por correo** en esta fase; el alumno lo
  descarga desde su Campus.
- **"Entregado todo"** se entiende como hoy: asistencia mínima y evaluaciones
  obligatorias aprobadas.
