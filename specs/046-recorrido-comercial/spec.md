# Feature Specification: Recorrido comercial del alumno

**Feature Branch**: `046-recorrido-comercial`

**Created**: 2026-10-23

**Status**: Draft

**Input**: User description: "Armar lo planificado de tracking para saber qué cursos hicieron realmente los contactos": el "Recorrido comercial del alumno (recompra y marketing)" anotado en `specs/ROADMAP.md` el 2026-10-19. Rutas sugeridas entre cursos, segmentos por historial, "le podría interesar…" para Ventas y métricas de recompra, reutilizando las audiencias y campañas de la 045.

## Contexto

El sistema sabe qué cursó cada persona, pero no lo usa para venderle el curso
siguiente. Quien hizo *Revit Arquitectura* es el candidato natural para *Revit
MEP* o *Revit Estructura*, y hoy nadie lo está mirando.

No confundir con el "recorrido" académico de la 028, que es el avance DENTRO de
una especialización. Esto es el historial ENTRE cursos, con mirada comercial.

La 045 ya resolvió el consentimiento y la baja, el permiso de marketing, las
audiencias y el envío de campañas. Esta funcionalidad agrega qué cursó cada
persona (de verdad), qué le conviene después, y cuánto se recompra.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Saber qué cursó de verdad cada persona (Priority: P1)

En la ficha de un contacto, Ventas o Coordinación ve su **historial de cursos**:
cada curso con el grupo, las fechas y cómo le fue ("aprobó", "cursó sin
aprobar", "en curso", "inscripto, por empezar"). Lo que no se dictó (grupos que
nunca salieron) no figura como cursado.

**Why this priority**: todo lo demás (segmentos, sugerencias, métricas) se apoya
en esta respuesta. Por sí sola ya sirve: el vendedor sabe con quién habla.

**Independent Test**: un contacto con un curso aprobado, uno cursado sin aprobar,
uno en curso y una inscripción en un grupo que nunca se dictó muestra los tres
primeros con su estado y no muestra el cuarto como cursado.

**Acceptance Scenarios**:

1. **Given** una persona que aprobó Revit Arquitectura en 2025, **When** se abre
   su ficha, **Then** el historial muestra "Revit Arquitectura · aprobó" con el
   grupo y las fechas.
2. **Given** una inscripción en un grupo que nunca se dictó (sin confirmar,
   terminado por fecha y sin actividad), **When** se ve el historial, **Then**
   no figura como cursado.
3. **Given** una especialización, **When** se ve el historial, **Then** figura
   una vez, como especialización, con cuántos módulos aprobó.

---

### User Story 2 - Definir qué curso sigue a cuál (Priority: P1)

Coordinación indica, para cada curso, cuáles son los **cursos siguientes
recomendados** y en qué orden (por ejemplo, Revit Arquitectura → Revit MEP,
Revit Estructura). Es una tabla armada por la academia, no un cálculo
automático, para que siempre se sepa por qué se sugiere algo.

**Why this priority**: sin rutas no hay sugerencias ni segmentos de "siguiente
paso". Es poco trabajo de carga y lo decide quien conoce la oferta.

**Independent Test**: cargar dos cursos siguientes para un curso, reordenarlos,
quitar uno, y ver que la ruta queda guardada en ese orden.

**Acceptance Scenarios**:

1. **Given** el curso Revit Arquitectura, **When** se agregan Revit MEP y Revit
   Estructura como siguientes, **Then** quedan guardados en ese orden.
2. **Given** una ruta, **When** se intenta que un curso se siga a sí mismo,
   **Then** no se permite.
3. **Given** un curso sin siguientes, **When** se ven sugerencias de alguien que
   lo cursó, **Then** no se sugiere nada por ese curso (y no hay error).

---

### User Story 3 - Ver "le podría interesar…" al atender a alguien (Priority: P1)

En la ficha del contacto (pestaña Seguimiento) aparece **"Le podría
interesar"**: los cursos siguientes de lo que ya cursó, sin los que ya hizo ni
en los que ya está inscripto, con el próximo grupo disponible de cada uno si lo
hay. El vendedor lo ve mientras habla con la persona.

**Why this priority**: es la recompra en el momento justo, sin depender de una
campaña.

**Independent Test**: una persona que aprobó Revit Arquitectura, con la ruta
cargada hacia MEP y Estructura y ya inscripta en Estructura, ve sugerido solo
Revit MEP, con su próximo grupo.

**Acceptance Scenarios**:

1. **Given** la ruta Arquitectura → MEP, Estructura y una persona que aprobó
   Arquitectura, **When** se abre su Seguimiento, **Then** se sugieren MEP y
   Estructura, cada uno con su próximo grupo abierto a inscripción si existe.
2. **Given** que ya hizo o está inscripta en uno de ellos, **When** se ve la
   sugerencia, **Then** ese curso no aparece.
3. **Given** una persona sin cursos, **When** se ve su Seguimiento, **Then** la
   sección no aparece (sin texto vacío).

---

### User Story 4 - Segmentar por historial para una campaña (Priority: P1)

En las audiencias de Marketing se suman filtros por historial: "cursó X",
"aprobó X", "cursó X sin aprobar", "NO hizo Y" y "cursó algo de una categoría o
curso en los últimos N meses". Así se arma, por ejemplo, "aprobaron Revit
Arquitectura y no hicieron Revit MEP" y se le manda una campaña.

**Why this priority**: convierte el historial en ventas a escala, con todo lo
que la 045 ya garantiza (bajas, tope, envío).

**Independent Test**: con datos conocidos, la audiencia "aprobaron A y no
hicieron B" devuelve exactamente a quienes cumplen, y excluye a quienes se
dieron de baja.

**Acceptance Scenarios**:

1. **Given** 10 personas que aprobaron Arquitectura, 3 de ellas ya con MEP,
   **When** se filtra "aprobó Arquitectura" y "no hizo MEP", **Then** la
   audiencia trae a las 7 restantes.
2. **Given** inscripciones en grupos que nunca se dictaron, **When** se filtra
   "cursó X", **Then** no cuentan como cursado.
3. **Given** el atajo "siguiente paso de una ruta", **When** se elige el curso
   Arquitectura, **Then** la audiencia se arma sola: cursaron Arquitectura y no
   hicieron ninguno de sus siguientes.

---

### User Story 5 - Medir la recompra (Priority: P2)

En Marketing, una vista **"Recompra"** muestra: cuántas personas compraron más
de un curso (tasa de recompra), cuánto tiempo pasa en promedio entre un curso y
el siguiente, y qué cursos "llevan" más a otro (pares curso → curso siguiente,
con cuántas personas).

**Why this priority**: orienta qué rutas y campañas valen la pena, pero no es
necesaria para vender.

**Independent Test**: con un historial conocido, las tres cifras coinciden con
el cálculo a mano.

**Acceptance Scenarios**:

1. **Given** 100 personas con al menos un curso y 30 con dos o más, **When** se
   abre Recompra, **Then** muestra una tasa del 30%.
2. **Given** un filtro de período, **When** se cambia, **Then** las cifras se
   recalculan para ese período.

---

### Edge Cases

- Una persona hizo el mismo curso dos veces (recursada): cuenta una vez como
  "cursó", con el mejor resultado.
- Un curso de la ruta se dio de baja de la oferta (no se publica más): no se
  sugiere.
- Un siguiente sin grupos abiertos: se sugiere igual, diciendo "sin grupo
  abierto por ahora".
- Talleres: no cuentan como cursos en el historial comercial (igual que en el
  legajo), salvo que se decida lo contrario.
- Rutas en círculo (A → B → A): se permiten, porque cada sugerencia descarta lo
  ya hecho.
- Contactos archivados o dados de baja de marketing: aparecen en su historial y
  sugerencias (es información para quien atiende), pero las audiencias los
  excluyen como siempre.

## Requirements *(mandatory)*

### Functional Requirements

**Historial**

- **FR-001**: El sistema MUST derivar, por contacto, el historial de cursos con
  estado: aprobó, cursó sin aprobar, en curso, inscripto por empezar.
- **FR-002**: Una inscripción en un grupo que nunca se dictó MUST NOT contar como
  cursada. Es la misma regla que ya oculta esos grupos en el portal del alumno.
- **FR-003**: Una especialización MUST contar como una sola entrada, con sus
  módulos aprobados. Los talleres no cuentan.
- **FR-004**: El historial MUST verse en la ficha del contacto para quien puede
  ver contactos.

**Rutas**

- **FR-005**: El sistema MUST permitir definir, por curso, una lista ordenada de
  cursos siguientes recomendados, sin autorreferencias.
- **FR-006**: Editar rutas MUST requerir el permiso de edición académica.

**Sugerencias**

- **FR-007**: El Seguimiento del contacto MUST mostrar "Le podría interesar":
  los siguientes de lo que cursó, sin repetidos, sin lo ya hecho ni lo inscripto,
  sin cursos que no se publican, en el orden de la ruta, con el próximo grupo
  abierto a inscripción si existe.

**Segmentos**

- **FR-008**: Las audiencias de Marketing MUST sumar filtros por historial:
  cursó, aprobó, cursó sin aprobar, no hizo, y cursó algo (curso o categoría)
  en los últimos N meses. Se combinan con los filtros existentes.
- **FR-009**: MUST existir el atajo "siguiente paso de la ruta del curso X".
- **FR-010**: Los filtros por historial MUST usar la misma definición que FR-001
  y FR-002.

**Métricas**

- **FR-011**: La vista Recompra MUST mostrar la tasa de recompra, el tiempo
  promedio entre cursos y los pares curso → curso siguiente más frecuentes, para
  un período elegido.
- **FR-012**: Las métricas y los segmentos MUST requerir el permiso de ver
  marketing; no muestran plata.

**Datos**

- **FR-013**: Todo dato nuevo MUST pertenecer a una organización y quedar aislado
  como el resto del sistema.

### Key Entities

- **Ruta entre cursos**: curso de origen, curso siguiente, orden.
- **Cursada comercial** (derivada, no se guarda): contacto, curso, grupo,
  fechas y resultado, según FR-001 a FR-003.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: En la ficha de cualquier contacto, quien atiende ve qué cursó y qué
  le conviene después sin salir de la pantalla.
- **SC-002**: Una audiencia "aprobaron A y no hicieron B" se arma en menos de un
  minuto.
- **SC-003**: Ningún grupo que nunca se dictó cuenta como curso hecho en el
  historial, los segmentos ni las métricas.
- **SC-004**: La academia puede ver su tasa de recompra por período, para decidir
  en qué rutas invertir campañas.

## Assumptions

- "Aprobó" es el estado de aprobación que ya calcula el sistema (asistencia y
  evaluaciones). "Cursó" es tener actividad en un grupo que se dictó.
- La categoría de un curso es la que ya tiene el catálogo. Si no hay
  categorías, el filtro por categoría se ofrece por lista de cursos.
- Las rutas las carga Coordinación desde la ficha del curso en Académico.
- No hay sugerencias "inteligentes" ni automáticas en esta etapa.
- **Fuera de alcance:** puntaje de propensión, sugerencias automáticas por
  similitud, envío automático disparado por eventos y telemetría del portal.

## Dependencies

- **045 Marketing**: las audiencias, campañas, bajas y el permiso `marketing.ver`.
- **Regla de grupos no dictados** (`cursadaNuncaDictada`, 2026-10-22): define qué
  no cuenta como cursado.
