# Feature Specification: Tipos de curso, módulos con nombre propio y filtros

**Feature Branch**: `032-tipos-de-curso`

**Created**: 2026-10-15

**Status**: Draft

**Depende de**: 028 (especializaciones y módulos) · **Habilita**: 033 (talleres)

**Input**: Pedido del dueño (2026-10-15): "Los módulos de la especialización se llaman Módulo 1, Módulo 2… y a veces no representan a un curso como AutoCAD, así que no los puedo crear sin atarlos a uno. Quiero poder diferenciar cursos de módulos y de talleres, filtrar para tener una vista más clara en la página de cursos, y filtrar para ver solo lo que empieza o termina en el año actual: si estoy en 2030 no quiero un listado enorme de cursos de 2026. Y que se puedan borrar cursos que no tienen nada asociado, así no quedan huérfanos."

## Por qué esta fase existe

En el catálogo del CRM, hoy todo es "curso", y eso trae tres problemas:

1. **Los módulos no se pueden crear con su nombre.** Un módulo de una
   especialización es una cohorte, y toda cohorte cuelga de un curso. Cuando
   el módulo es una etapa del programa ("Módulo 1 — Fundamentos") y no un
   curso que la academia vende, la coordinación tiene que atarlo a uno que no
   corresponde (p. ej. AutoCAD), o directamente no crearlo.
2. **La página de Académico mezcla todo y crece sin fin.** Cursos de
   catálogo, módulos y talleres aparecen juntos. Las cohortes de todos los
   años se acumulan: en 2030 la lista arrastraría todo 2026.
3. **Un curso creado por error no se puede borrar.** Queda en el catálogo
   para siempre, aunque nunca haya tenido una cohorte.

La pieza que resuelve los dos primeros es la misma: **que cada curso tenga un
tipo** (curso, módulo o taller). Con el tipo, un módulo es un curso de tipo
*módulo* con su propio nombre, y los listados se pueden filtrar. Los talleres
reciben su gestión propia en 033; esta fase solo les da el tipo.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Crear un módulo con nombre propio desde la especialización (Priority: P1)

La coordinación está armando "EBIM 15". Desde la especialización agrega un
módulo y elige **"Módulo nuevo"**: escribe "Módulo 1 — Fundamentos", elige
profesor y fechas, y lo guarda. No tuvo que elegir AutoCAD ni ningún otro
curso. El sistema crea por detrás un curso de tipo *módulo* con ese nombre y
la cohorte del módulo, en su posición dentro del programa.

**Why this priority**: Es el bloqueo que hoy impide cargar especializaciones
reales.

**Independent Test**: Crear una especialización, agregarle un "Módulo nuevo"
con nombre propio y verificar que aparece en el programa, en su posición, sin
haber elegido un curso existente.

**Acceptance Scenarios**:

1. **Given** una cohorte marcada como especialización, **When** la
   coordinación agrega un módulo con la opción "Módulo nuevo" y un nombre,
   **Then** se crean juntos un curso de tipo *módulo* con ese nombre y la
   cohorte del módulo dentro de la especialización.
2. **Given** el formulario en modo "Módulo nuevo", **When** se intenta
   guardar sin nombre, **Then** no se crea nada y se indica que el nombre es
   obligatorio.
3. **Given** el formulario de módulo, **When** la coordinación elige un curso
   existente (de cualquier tipo), **Then** el módulo se crea atado a ese
   curso exactamente como hoy.
4. **Given** una especialización con un módulo propio, **When** se le asigna
   profesor, se genera el cronograma, se cargan evaluaciones y licencias,
   **Then** todo funciona igual que en un módulo atado a un curso de
   catálogo, y los portales del profesor y del alumno muestran el nombre del
   módulo.

---

### User Story 2 - Clasificar los cursos por tipo y filtrar (Priority: P1)

La coordinación abre Académico → Cursos. Cada curso muestra su tipo (Curso,
Módulo o Taller). Arriba hay un filtro por tipo; por defecto se ven solo los
de tipo *Curso*, que es lo que más se consulta. Con un clic ve también los
módulos o los talleres. Al editar un curso puede cambiarle el tipo.

**Why this priority**: Sin el tipo no hay ni filtro, ni módulo con nombre
propio, ni base para 033.

**Independent Test**: Marcar un curso como Taller y otro como Módulo, y
verificar que el filtro por tipo muestra cada uno solo bajo su tipo.

**Acceptance Scenarios**:

1. **Given** cursos existentes antes de esta fase, **When** se despliega,
   **Then** todos quedan con tipo *Curso* y se ven igual que antes.
2. **Given** la pestaña Cursos, **When** se elige el filtro "Taller",
   **Then** solo se listan los cursos de tipo taller.
3. **Given** un curso, **When** la coordinación le cambia el tipo y guarda,
   **Then** aparece bajo el filtro del tipo nuevo.
4. **Given** un curso de tipo *Módulo*, **When** se consulta el catálogo
   público de la web, **Then** no aparece, aunque esté marcado como
   publicado.

---

### User Story 3 - Ver solo las cohortes del año (Priority: P2)

En Académico → Cohortes, la coordinación activa **"Solo este año"** y ve
únicamente las cohortes que empiezan o terminan en el año en curso. También
puede elegir otro año. El filtro por tipo de curso aplica acá también: puede
ver, por ejemplo, solo los talleres de este año.

**Why this priority**: La lista crece cada año; hoy es molesto, en dos años
es inmanejable. No bloquea a nadie hoy, por eso P2.

**Independent Test**: Con cohortes de 2025, 2026 y una que cruza de 2025 a
2026, activar "Solo este año" en 2026 y verificar que se ven las de 2026 y la
que cruza, pero no las que terminaron en 2025.

**Acceptance Scenarios**:

1. **Given** una cohorte que empieza en noviembre de 2025 y termina en marzo
   de 2026, **When** se filtra por 2026, **Then** aparece (termina en 2026).
2. **Given** una cohorte de marzo a junio de 2025, **When** se filtra por
   2026, **Then** no aparece.
3. **Given** una cohorte sin fechas cargadas, **When** se filtra por año,
   **Then** aparece igual, marcada como "sin fechas", para que no se pierda
   de vista una cohorte a medio cargar.
4. **Given** el filtro de año activo, **When** la coordinación recarga la
   página, **Then** el filtro se conserva.
5. **Given** los filtros de año y tipo activos, **When** se combinan con el
   filtro de estado que ya existe (en curso, planificada, finalizada),
   **Then** se aplican los tres a la vez.

---

### User Story 4 - Borrar un curso sin nada asociado (Priority: P2)

La coordinación creó por error un curso "Revit 2027 (copia)". Lo abre, elige
**Borrar** y, como no tiene cohortes ni nada que lo use, se borra. Si intenta
borrar AutoCAD, el sistema no lo permite y le dice exactamente qué lo está
usando.

**Why this priority**: Limpia el catálogo, pero un curso huérfano no impide
trabajar.

**Independent Test**: Crear un curso y borrarlo sin haberle creado nada;
intentar borrar un curso con cohortes y verificar el bloqueo con su motivo.

**Acceptance Scenarios**:

1. **Given** un curso sin cohortes, sin interesados y sin formularios que lo
   usen, **When** se borra, **Then** desaparece de todos los listados.
2. **Given** un curso con al menos una cohorte, **When** se intenta borrar,
   **Then** no se borra y el mensaje dice cuántas cohortes tiene y sugiere
   cambiarle el tipo o despublicarlo si lo que se quiere es sacarlo de la
   vista.
3. **Given** un curso con personas registradas como interesadas en él (leads
   de la web o del pipeline), **When** se intenta borrar, **Then** no se
   borra y el mensaje dice cuántas.
4. **Given** un curso al que apunta un formulario de captación, **When** se
   intenta borrar, **Then** no se borra y el mensaje nombra el formulario.
5. **Given** un curso sin nada asociado pero con material propio, módulos de
   temario o profesores habilitados, **When** se borra, **Then** esos datos
   se van con él (no son historia de ninguna persona).

---

### Edge Cases

- **Dos especializaciones con "Módulo 1"**: cada "Módulo nuevo" crea su
  propio curso de tipo módulo; los nombres pueden repetirse y el
  identificador público de cada curso no choca con ningún otro.
- **Renombrar un módulo propio**: cambiar el nombre del curso de tipo módulo
  se refleja en la especialización y en los portales. Los certificados ya
  emitidos conservan el nombre con el que se emitieron.
- **Cambiar de tipo un curso que ya tiene cohortes**: está permitido; el tipo
  clasifica, no cambia el comportamiento de las cohortes que ya existen.
- **Selectores de curso**: al crear una cohorte común, al inscribir o al
  configurar un formulario, los cursos de tipo *módulo* no se ofrecen por
  defecto (sí se pueden mostrar con el filtro), porque inscribir a alguien
  directamente en un módulo ya está prohibido desde 028.
- **Borrar el curso de un módulo propio**: sigue la misma regla; mientras la
  cohorte del módulo exista, el curso no se puede borrar.
- **Cohorte que cruza el cambio de año** (de noviembre a marzo): aparece en
  los dos años.
- **El filtro de año en los módulos de una especialización**: se evalúa
  sobre la cohorte madre; los módulos se ven dentro de ella como hoy.

## Requirements *(mandatory)*

### Functional Requirements

**Tipo de curso**

- **FR-001**: Todo curso MUST tener un tipo: *Curso*, *Módulo* o *Taller*.
- **FR-002**: Los cursos existentes al desplegar MUST quedar con tipo
  *Curso*, sin ningún otro cambio visible.
- **FR-003**: La coordinación MUST poder ver y cambiar el tipo al crear o
  editar un curso.
- **FR-004**: Los cursos de tipo *Módulo* MUST NOT aparecer en el catálogo
  público de la web, independientemente de su marca de publicado.

**Módulos con nombre propio**

- **FR-005**: Al agregar un módulo a una especialización, la coordinación
  MUST poder elegir entre "Curso existente" (comportamiento actual) y
  "Módulo nuevo".
- **FR-006**: En "Módulo nuevo", el sistema MUST pedir solo el nombre
  (obligatorio, sin espacios sobrantes, hasta 120 caracteres) además de los
  datos propios de la cohorte del módulo, y MUST crear el curso de tipo
  *Módulo* y la cohorte del módulo de forma atómica: o los dos o ninguno.
- **FR-007**: Un curso de tipo *Módulo* creado así MUST NOT otorgar
  certificado propio por defecto; la coordinación lo puede cambiar. Cuenta
  igual para la aprobación y el certificado general de la especialización.
- **FR-008**: Un módulo atado a un curso de tipo *Módulo* MUST admitir todo
  lo que admite cualquier módulo: profesor, cronograma, asistencia,
  evaluaciones y correcciones, licencias, material, avisos, grabaciones y
  certificado.

**Filtros en Académico**

- **FR-009**: La pestaña Cursos MUST ofrecer un filtro por tipo, con
  selección múltiple, cuyo valor por defecto es solo *Curso*.
- **FR-010**: Cada curso del listado MUST mostrar su tipo.
- **FR-011**: La pestaña Cohortes MUST ofrecer un filtro por año: muestra las
  cohortes cuya fecha de inicio O de fin cae en el año elegido. La opción por
  defecto MUST ser "Todos los años" la primera vez, y MUST recordarse la
  última elección de cada persona.
- **FR-012**: Las cohortes sin ninguna fecha MUST aparecer con cualquier
  filtro de año, marcadas como "sin fechas".
- **FR-013**: La pestaña Cohortes MUST ofrecer el mismo filtro por tipo de
  curso, combinable con el de año y con el de estado ya existente.
- **FR-014**: Los contadores de cada filtro MUST reflejar cuántas cohortes o
  cursos quedan con los demás filtros aplicados.

**Borrar cursos**

- **FR-015**: La coordinación MUST poder borrar un curso solo si no tiene
  cohortes, ni personas registradas como interesadas en él, ni formularios
  de captación que lo usen.
- **FR-016**: Cuando el borrado se bloquea, el sistema MUST decir qué lo
  impide y cuántos son, y sugerir la alternativa (cambiar el tipo o
  despublicar).
- **FR-017**: Al borrar un curso MUST borrarse con él lo que solo existe
  para ese curso y no es historia de ninguna persona: su material, sus
  módulos de temario y la habilitación de profesores para ese curso.
- **FR-018**: El borrado MUST pedir confirmación explícita con el nombre del
  curso.

**Transversales**

- **FR-019**: Crear, editar, cambiar el tipo y borrar cursos MUST exigir la
  misma capacidad que hoy exige gestionar cursos; esta fase no agrega
  capacidades.
- **FR-020**: Toda lectura y escritura MUST quedar aislada por organización,
  como el resto de los datos de dominio.

### Key Entities *(include if feature involves data)*

- **Curso** (cambia): suma el atributo **tipo** (*Curso*, *Módulo*,
  *Taller*). El tipo clasifica y controla la visibilidad en catálogo y
  selectores; no cambia cómo funcionan sus cohortes.
- **Cohorte** (sin cambios): sus fechas de inicio y fin son las que usa el
  filtro de año.
- **Especialización** (sin cambios): puede tener módulos atados a cursos de
  cualquier tipo, incluidos los de tipo *Módulo* creados desde ella.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: La coordinación crea un módulo con nombre propio en menos de 1
  minuto, sin elegir ni crear antes un curso del catálogo.
- **SC-002**: Una especialización real se carga completa (todos sus módulos
  con nombre propio, profesor y cronograma) sin tocar ningún curso de tipo
  *Curso*.
- **SC-003**: Con el filtro por defecto, la pestaña Cursos no muestra ningún
  módulo ni taller.
- **SC-004**: Con "Solo este año", la pestaña Cohortes muestra únicamente
  cohortes que empiezan o terminan en el año, más las que no tienen fechas:
  cero cohortes de años anteriores.
- **SC-005**: El 100% de los intentos de borrar un curso con historia se
  bloquea con un motivo que nombra qué lo impide; el 100% de los cursos sin
  nada asociado se puede borrar.
- **SC-006**: Ningún curso, cohorte ni inscripción existente cambia de
  comportamiento después del despliegue.

## Assumptions

- **Los talleres solo reciben el tipo en esta fase.** Su sección propia, el
  formulario público de inscripción, los estados de los inscriptos
  (anotado, confirmado, asistió) y el pago único integrado a Cobranza son la
  fase 033.
- **El filtro por tipo arranca en "solo Curso"** porque es lo que más se
  consulta; los módulos se gestionan desde su especialización y los talleres
  tendrán su sección.
- **El filtro de año arranca en "Todos los años"** la primera vez para que
  nadie piense que se perdieron cohortes después del despliegue.
- **Convertir módulos ya atados a un curso de catálogo** a un curso de tipo
  módulo queda fuera: si hace falta, se crea el módulo nuevo y se borra la
  cohorte vieja si no tiene historia.
- **Varios profesores por cohorte** queda fuera: es otra feature.
- La preferencia de filtros se guarda por persona en su navegador; no es un
  dato que haya que compartir.
