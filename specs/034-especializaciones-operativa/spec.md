# Feature Specification: Especializaciones en la operación diaria

**Feature Branch**: `034-especializaciones-operativa`

**Created**: 2026-10-15

**Status**: Draft

**Depende de**: 028 (especializaciones), 009 (clases y asistencia), 005 (licencias), 032 (tipos de curso)

**Input**: Pedido del dueño (2026-10-15):

- "Si los alumnos pertenecen a una especialización, automáticamente si creo un módulo debería meterlos en ese módulo. No tengo por qué volver a inscribirlos."
- "Tengo que poder borrar una clase o un rango: en diciembre y enero cierra la empresa, en esos días no puede figurar que hay clase, es un receso. La fecha de fin ya contempla el receso. Si se cancela y se reprograma, no sé si está considerado hoy."
- "En el módulo hay que sacar lo que se duplica y se maneja desde la especialización (p. ej. cursos offline). Asistencia está bien que esté en el módulo."
- "A veces la licencia se asigna para el módulo y a veces para toda la especialización, como un paquete, y el paquete puede tener varios programas."

## Por qué esta fase existe

028 dejó el **modelo** de las especializaciones bien armado: un módulo es una
cohorte, y cada alumno tiene una inscripción a la especialización (la madre)
y una por cada módulo que cursa (las hijas). Pero la **operación diaria**
quedó cuesta arriba:

1. **Las inscripciones a los módulos se hacen a mano, alumno por alumno.**
   Crear un módulo no inscribe a nadie, e inscribir a alguien en la
   especialización no lo mete en los módulos que ya existen. El caso normal
   —el grupo entero cursa todo el programa— es el más trabajoso.
2. **No hay recesos.** El cronograma se arma con todos los días marcados
   entre la fecha de inicio y la de fin. Las clases de diciembre y enero se
   pueden cancelar de a una, pero siguen figurando, y regenerar el
   cronograma las vuelve a crear.
3. **No se puede reprogramar.** Una clase cancelada no se puede mover a otra
   fecha.
4. **La pantalla del módulo es la de una cohorte suelta.** Ofrece inscribir
   (prohibido en un módulo desde 028), asignar cursos offline y dar acceso
   al portal: todo eso se gestiona en la especialización.
5. **Una inscripción admite una sola licencia.** El paquete de una
   especialización con Revit, Navisworks y AutoCAD no se puede cargar.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Los alumnos de la especialización entran solos a sus módulos (Priority: P1)

"EBIM 15" tiene 16 alumnos. La coordinación agrega "Módulo 3 — Coordinación
BIM" y los 16 quedan inscriptos en el módulo sin hacer nada más. Más tarde se
suma una alumna a la especialización y queda inscripta en los módulos que ya
existen.

**Why this priority**: Es el reclamo principal: hoy hay que repetir el alta
alumno por alumno, módulo por módulo.

**Independent Test**: Con una especialización con alumnos, crear un módulo y
verificar que todos los alumnos activos quedan inscriptos en él; inscribir a
una persona nueva y verificar que queda en todos los módulos.

**Acceptance Scenarios**:

1. **Given** una especialización con alumnos activos, **When** se crea un
   módulo, **Then** cada alumno activo queda inscripto en el módulo.
2. **Given** una especialización con módulos, **When** se inscribe a una
   persona nueva, **Then** queda inscripta en cada módulo de la
   especialización.
3. **Given** un alumno dado de baja de la especialización, **When** se crea
   un módulo, **Then** no se lo inscribe.
4. **Given** un alumno que ya cursa ese módulo en otra camada (recursada),
   **When** se crea o se le asigna el módulo, **Then** no se le crea una
   segunda inscripción para el mismo módulo.
5. **Given** la inscripción automática a un módulo, **When** se crea,
   **Then** no genera cuotas ni pide vendedor: el pago sigue siendo el de la
   especialización.
6. **Given** que un alumno no va a cursar un módulo puntual, **When** la
   coordinación lo saca de ese módulo, **Then** su inscripción al módulo se
   da de baja sin afectar la de la especialización ni la de los otros
   módulos.

---

### User Story 2 - Recesos sin clases (Priority: P1)

La coordinación carga **"Receso de verano: 15/12 al 31/01"** para toda la
academia. Desde ese momento ningún cronograma genera clases en esos días, el
calendario no las proyecta, y las clases ya generadas en ese rango
desaparecen. Las fechas de fin de las cohortes no cambian.

**Why this priority**: Hoy los alumnos y profesores ven clases que no
existen, y la asistencia de esos días queda como un hueco.

**Independent Test**: Con una cohorte con clases en diciembre y enero, cargar
el receso y verificar que esas clases ya no figuran, que regenerar el
cronograma no las crea, y que el calendario tampoco las proyecta.

**Acceptance Scenarios**:

1. **Given** un receso de la academia del 15/12 al 31/01, **When** se genera
   el cronograma de cualquier cohorte, **Then** no se crea ninguna clase en
   esas fechas.
2. **Given** clases ya generadas dentro del rango del receso, **When** se
   carga el receso, **Then** las clases sin asistencia ni grabación se
   borran, y la pantalla dice cuántas.
3. **Given** una clase dentro del receso que ya tiene asistencia o
   grabación, **When** se carga el receso, **Then** esa clase NO se borra y
   el sistema la lista para que una persona decida.
4. **Given** un receso cargado, **When** se mira el calendario, **Then** los
   días del receso no muestran clases proyectadas, y se ven marcados como
   receso.
5. **Given** un receso, **When** se lo borra o se acorta, **Then** las clases
   no se recrean solas; aparecen cuando se regenere el cronograma.
6. **Given** un receso que solo aplica a una cohorte, **When** se carga
   desde esa cohorte, **Then** solo afecta a esa cohorte.
7. **Given** una cohorte, **When** se carga un receso, **Then** su fecha de
   fin no cambia.

---

### User Story 3 - Borrar y reprogramar clases (Priority: P2)

La coordinación borra una clase suelta creada por error, o un rango de
clases de una cohorte. Y cuando una clase se cancela porque el profesor se
enfermó, la **reprograma**: elige la nueva fecha y hora, y queda registrado
que la nueva viene de la cancelada.

**Why this priority**: Es frecuente, pero hoy se puede salir del paso
cancelando.

**Independent Test**: Borrar una clase sin asistencia; intentar borrar una
con asistencia y verificar el bloqueo; cancelar una clase, reprogramarla y
verificar que la nueva figura con su origen.

**Acceptance Scenarios**:

1. **Given** una clase sin asistencia ni grabación, **When** se borra,
   **Then** desaparece del cronograma, del calendario y de los portales.
2. **Given** una clase con asistencia o grabación, **When** se intenta
   borrar, **Then** no se borra y se ofrece cancelarla.
3. **Given** un rango de fechas de una cohorte, **When** se borran las
   clases del rango, **Then** se borran las que no tienen historia y se
   listan las que no se pudieron borrar.
4. **Given** una clase cancelada, **When** se reprograma a una fecha y hora
   nuevas, **Then** se crea la clase nueva, la cancelada indica "reprogramada
   al …" y la nueva indica "reprogramación de la clase del …".
5. **Given** una clase reprogramada a una fecha dentro de un receso, **When**
   se intenta guardar, **Then** el sistema avisa del receso y pide
   confirmación explícita.
6. **Given** una clase reprogramada, **When** se cuenta el total de clases y
   la asistencia, **Then** la cancelada no cuenta y la reprogramada sí.

---

### User Story 4 - La pantalla del módulo muestra solo lo del módulo (Priority: P2)

La coordinación entra a "Módulo 3 — Coordinación BIM". Ve arriba "Parte de
EBIM 15 · Módulo 3 de 4", con acceso directo a la especialización. Tiene
Clases, Asistencia, Evaluación, Avisos y la lista de Alumnos. No ve el botón
de inscribir, ni la asignación de cursos offline, ni el acceso al portal, ni
datos comerciales: eso está en la especialización.

**Why this priority**: Reduce errores y confusión, pero no bloquea la
operación.

**Independent Test**: Abrir un módulo y verificar qué pestañas y acciones
aparecen; abrir una cohorte común y verificar que no cambió nada.

**Acceptance Scenarios**:

1. **Given** una cohorte que es módulo de una especialización, **When** se
   abre, **Then** muestra Clases, Asistencia, Evaluación, Avisos y Alumnos,
   y NO muestra Cursos offline.
2. **Given** la pestaña Alumnos de un módulo, **When** se la mira, **Then**
   lista quién cursa el módulo con su asistencia y estado, sin botón de
   inscribir, sin acceso al portal y sin datos comerciales; ofrece sacar a un
   alumno de ese módulo (US1, escenario 6) y asignarle licencias del módulo.
3. **Given** un módulo, **When** se lo abre, **Then** el encabezado indica a
   qué especialización pertenece y su posición, con un acceso directo.
4. **Given** una cohorte común (no especialización, no módulo), **When** se
   la abre, **Then** se ve exactamente igual que antes de esta fase.

---

### User Story 5 - Varias licencias por inscripción (Priority: P2)

Al inscribir a alguien en "EBIM 15", la coordinación le asigna el **paquete**:
Revit, Navisworks y AutoCAD, que valen para todo el programa. En otra
especialización, la licencia de Revit se asigna solo en el módulo de Revit.

**Why this priority**: Sin esto el paquete no se puede cargar, pero hoy se
puede asignar al menos uno.

**Independent Test**: Asignar tres programas a la inscripción de una
especialización y uno a la de un módulo, y verificar que las cuatro
licencias figuran y descuentan del stock de cada programa.

**Acceptance Scenarios**:

1. **Given** una inscripción a una especialización, **When** se le asignan
   Revit, Navisworks y AutoCAD, **Then** quedan las tres licencias, cada una
   descontando del stock de su programa.
2. **Given** una inscripción a un módulo, **When** se le asigna una licencia,
   **Then** queda en el módulo, independiente del paquete de la
   especialización.
3. **Given** una inscripción, **When** se intenta asignarle dos veces el
   mismo programa, **Then** el sistema no lo permite.
4. **Given** un programa sin licencias disponibles, **When** se intenta
   asignar, **Then** el sistema lo indica y no la asigna.
5. **Given** inscripciones con una licencia de antes de esta fase, **When**
   se despliega, **Then** cada una conserva su licencia sin cambios.
6. **Given** el alumno en su portal, **When** mira sus licencias, **Then** ve
   las de la especialización y las del módulo que cursa.

---

### Edge Cases

- **Módulo creado antes de inscribir a nadie**: no hay a quién inscribir; los
  alumnos entran cuando se inscriben en la especialización.
- **Módulos existentes con alumnos que no están inscriptos en ellos** (por el
  funcionamiento anterior): la coordinación puede ejecutar "Inscribir a todos
  los alumnos en sus módulos" una vez desde la especialización; no se hace
  solo al desplegar.
- **Alumno que se da de baja de la especialización**: sus inscripciones a
  módulos futuros no se crean; las existentes siguen la regla de baja de 028.
- **Receso que corta una clase de varios días** o una cohorte que empieza o
  termina dentro del receso: el receso manda; no se generan clases en esos
  días.
- **Receso de la academia y receso de una cohorte superpuestos**: se suman;
  ningún día de ninguno de los dos tiene clase.
- **Proyección del calendario**: una cohorte sin cronograma generado tampoco
  proyecta clases en días de receso.
- **Reprogramar una clase que ya fue reprogramada**: no se permite; se
  reprograma la clase nueva.
- **Licencia de un módulo y del paquete con el mismo programa**: está
  permitido (son inscripciones distintas); la pantalla lo advierte para que
  no se descuente stock dos veces sin querer.

## Requirements *(mandatory)*

### Functional Requirements

**Inscripción automática a módulos**

- **FR-001**: Al crear un módulo en una especialización, el sistema MUST
  inscribir en él a cada alumno activo de la especialización, en la misma
  operación.
- **FR-002**: Al inscribir a una persona en una especialización, el sistema
  MUST inscribirla en cada módulo existente de la especialización.
- **FR-003**: La inscripción automática MUST NOT crear una segunda
  inscripción al mismo módulo para alguien que ya lo cursa (en esta camada o
  en otra), MUST NOT inscribir a quien está dado de baja de la
  especialización, y MUST NOT generar cuotas ni exigir vendedor.
- **FR-004**: La coordinación MUST poder sacar a un alumno de un módulo
  puntual sin afectar su inscripción a la especialización ni a los otros
  módulos.
- **FR-005**: La especialización MUST ofrecer la acción "Inscribir a todos
  los alumnos en sus módulos", idempotente, para regularizar módulos creados
  antes de esta fase. Antes de ejecutar MUST mostrar una vista previa: cuántas
  inscripciones a módulo se van a crear, cuántas ya existían y a quién se
  excluye y por qué (baja, recursada en otra camada). Ejecutarla dos veces
  MUST NOT crear nada la segunda vez.
- **FR-005a**: Cuando a una especialización le faltan inscripciones a
  módulos, su pantalla MUST mostrar un aviso con el faltante ("9 alumnos sin
  inscribir en 4 módulos") y el acceso a la acción de FR-005. Caso real en
  producción al 2026-10-15: EBIM 14, 4 módulos, 9 alumnos, 0 inscripciones a
  módulo (faltan 36).

**Recesos**

- **FR-006**: La coordinación MUST poder cargar recesos como rangos de
  fechas con un nombre, de alcance **academia** (todas las cohortes) o de
  una **cohorte** puntual.
- **FR-007**: La generación de cronogramas MUST NOT crear clases en días de
  receso, y el calendario MUST NOT proyectar clases en esos días.
- **FR-008**: Al cargar un receso, las clases existentes en el rango que no
  tienen asistencia ni grabación MUST borrarse; las que tienen historia MUST
  conservarse y listarse para una decisión manual.
- **FR-009**: Un receso MUST NOT cambiar la fecha de inicio ni la de fin de
  ninguna cohorte.
- **FR-010**: Borrar o acortar un receso MUST NOT recrear clases
  automáticamente.
- **FR-011**: El calendario MUST mostrar los días de receso marcados como
  tales.

**Borrar y reprogramar clases**

- **FR-012**: La coordinación MUST poder borrar una clase, o las clases de
  una cohorte en un rango de fechas, solo si no tienen asistencia ni
  grabación; las demás MUST conservarse y listarse.
- **FR-013**: La coordinación MUST poder reprogramar una clase cancelada a
  una fecha y hora nuevas; el sistema MUST vincular la clase nueva con la
  cancelada y mostrar el vínculo en las dos.
- **FR-014**: Reprogramar dentro de un receso MUST pedir confirmación
  explícita.
- **FR-015**: Una clase cancelada MUST NOT contar para el total de clases ni
  para la asistencia; su reprogramación MUST contar como cualquier clase.

**Pantalla del módulo**

- **FR-016**: Una cohorte que es módulo MUST mostrar Clases, Asistencia,
  Evaluación, Avisos y Alumnos, y MUST NOT mostrar Cursos offline.
- **FR-017**: La pestaña Alumnos de un módulo MUST ser una lista de quién lo
  cursa, con asistencia y estado, con las acciones de sacar del módulo y
  asignar licencias; MUST NOT ofrecer inscribir, acceso al portal ni datos
  comerciales.
- **FR-018**: El encabezado de un módulo MUST indicar su especialización y su
  posición, con acceso directo.
- **FR-019**: Las cohortes comunes MUST NOT cambiar.

**Licencias**

- **FR-020**: Una inscripción MUST admitir varias licencias, a lo sumo una
  por programa.
- **FR-021**: Las licencias MUST poder asignarse a la inscripción de la
  especialización (paquete) o a la de un módulo.
- **FR-022**: Cada licencia MUST descontar del stock de su programa; asignar
  sin stock MUST rechazarse.
- **FR-023**: Las licencias existentes MUST conservarse sin cambios al
  desplegar.
- **FR-024**: El portal del alumno MUST mostrar las licencias de su
  especialización y las de los módulos que cursa.

**Transversales**

- **FR-025**: Cada acción MUST exigir la capacidad que hoy gobierna su
  equivalente (inscripciones, gestión académica, asistencia, licencias);
  esta fase no agrega capacidades salvo que el plan lo justifique.
- **FR-026**: Toda lectura y escritura MUST quedar aislada por organización.

### Key Entities *(include if feature involves data)*

- **Receso**: nombre, fecha desde, fecha hasta, alcance (academia o una
  cohorte).
- **Clase** (cambia): suma el vínculo con la clase cancelada que reprograma.
- **Licencia** (cambia): una inscripción puede tener varias, a lo sumo una
  por programa.
- **Inscripción a módulo** (sin cambios de forma): ahora se crea sola.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Crear un módulo en una especialización de 16 alumnos deja a los
  16 inscriptos sin ninguna acción adicional.
- **SC-002**: Con un receso cargado, cero clases figuran en esos días en el
  cronograma, el calendario y los portales (salvo las que tienen historia y
  se listaron).
- **SC-003**: Regenerar un cronograma después de cargar un receso no crea
  ninguna clase dentro del receso.
- **SC-004**: El paquete de una especialización con tres programas se asigna
  en un solo paso por alumno.
- **SC-005**: Ninguna cohorte común, inscripción ni licencia existente cambia
  de comportamiento después del despliegue.

## Assumptions

- **Los recesos no corren la fecha de fin** (dueño, 2026-10-15): la fecha de
  fin ya se elige contemplando el receso.
- **La inscripción automática no corre sola sobre lo ya existente**: se
  regulariza con la acción explícita de FR-005, para que el despliegue no
  modifique datos sin que nadie lo decida.
- **Asistencia y avisos** se quedan en el módulo; cursos offline, acceso al
  portal y datos comerciales se gestionan en la especialización.
- **Que el módulo herede el enlace de Zoom o el aula de la especialización**
  queda fuera de esta fase (se conversó, no se pidió).
- **Varios profesores por cohorte** sigue fuera.
