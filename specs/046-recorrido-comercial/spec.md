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

### User Story 6 - Importar el historial 2020–2024 desde la app (Priority: P1)

*(Agregada el 2026-10-23, aprobada por el dueño.)*

Dirección sube la planilla histórica de cursadas 2020–2024 (≈ 2 132 personas y
2 882 cursadas, un CSV limpio con una fila por cursada) desde **Ajustes →
Importar historial**, sin scripts de servidor ni acceso directo a la base. Esos
años no tienen grupos ni inscripciones en el sistema: se guardan como
**registros históricos** de cursada, que el historial comercial cuenta como
"cursó (registro histórico)".

**Why this priority**: sin esos cinco años, el historial, las audiencias y
Recompra solo ven lo cargado desde 2025, y la mayoría de los exalumnos
aparecería como "no hizo nada".

**Independent Test**: con una planilla chica conocida, el paso de vista previa
dice exactamente cuántos contactos se crean, cuántos se completan, cuántas
cursadas se crean y qué filas tienen problemas; al confirmar, la ficha de una
de esas personas muestra la cursada con la marca "Registro histórico", y
"Deshacer esta importación" la saca sin borrar el contacto.

**Acceptance Scenarios**:

1. **Given** la planilla, **When** se sube, **Then** cada curso distinto de la
   planilla se asocia a un curso del catálogo (preelegido si el nombre coincide
   sin tildes ni mayúsculas) o se deja como texto, y cada vendedor distinto a un
   vendedor o "sin vendedor".
2. **Given** las asociaciones, **When** se pide la vista previa, **Then** se ven
   las cantidades (contactos a crear / a completar / sin cambios, empresas a
   crear, cursadas nuevas / ya presentes) y las filas con problemas, sin
   escribir nada.
3. **Given** una persona que ya existe con el mismo correo (o, si no, el mismo
   teléfono), **When** se importa, **Then** se usa ese contacto y solo se
   completan los datos que tenía vacíos; nunca se pisa un dato.
4. **Given** una importación ya aplicada, **When** se vuelve a importar la misma
   planilla, **Then** no se duplica ninguna cursada.
5. **Given** una importación, **When** se elige "Deshacer esta importación",
   **Then** se borran sus cursadas históricas; los contactos y empresas creados
   quedan.
6. **Given** una cursada histórica de Revit Arquitectura, **When** se filtra
   "cursó Revit Arquitectura", **Then** la persona entra; **When** se filtra
   "aprobó Revit Arquitectura", **Then** no entra (no se sabe si aprobó).

---

### User Story 7 - Tipo de contacto (Priority: P1)

*(Agregada el 2026-10-23, aprobada por el dueño.)*

Cada contacto tiene un **tipo derivado** de su historial comercial (la misma
derivación de US1, nunca guardado): **lead** (nunca cursó en un grupo que se
dictó y no tiene cursadas históricas), **alumno activo** (tiene un curso en
curso o por empezar) o **exalumno** (cursó algo, en el sistema o en la
planilla histórica, y no tiene nada activo). Precedencia: alumno activo >
exalumno > lead.

**Why this priority**: es la primera pregunta de quien abre Contactos ("¿es
alumno o lead?") y la base de las campañas a exalumnos.

**Independent Test**: un contacto con solo una inscripción en un grupo que
nunca se dictó es lead; con una cursada histórica es exalumno; con un grupo
por empezar es alumno activo aunque también sea exalumno.

**Acceptance Scenarios**:

1. **Given** la lista de Contactos, **When** se elige "Exalumnos", **Then** se
   ven solo los exalumnos, paginados desde el servidor, con la cantidad de
   cada tipo en su pestaña y una insignia por fila; el resaltado "Nuevo" de
   48 h sigue igual.
2. **Given** una audiencia de Marketing, **When** se filtra "tipo de contacto:
   exalumno", **Then** trae a los exalumnos y sigue excluyendo bajas,
   archivados, sin correo y prueba.

---

### User Story 8 - Reportes en el inicio (Priority: P1)

*(Agregada el 2026-10-23, aprobada por el dueño; ampliada con la planilla de
métricas de la academia.)*

Dirección y Coordinación (capacidad `reportes.ver`) ven en el inicio una
sección **Reportes**, con un período (por defecto los últimos 12 meses; "todo
el historial" incluye las cursadas históricas):

1. Cursos más cursados (top 10 + "Otros"), con "incluir cursos gratuitos"
   (apagado por defecto).
2. Alumnos por trimestre o por año.
3. Empresas que más capacitan (top 10).
4. Embudo de leads por origen (formulario, taller, WhatsApp, importación,
   carga manual): leads → inscriptos y conversión.
5. Recompra: la tasa y los 5 pares curso → curso siguiente más frecuentes.
6. Cursos vendidos por año (sin cursos gratuitos).
7. Ventas por vendedor y año (sin cursos gratuitos; "Sin vendedor" aparte).
8. Empresas vs. particulares por año.
9. Evolución por curso: cursadas por año de los 5 cursos más cursados, con
   un selector para elegir otros.
10. Ingresos cobrados por curso, SOLO si la sesión también tiene
    `cobranza.ver` (si no, ni se consultan ni viajan).

Un curso puede marcarse **"Gratuito: no cuenta como venta"** (Académico,
`academico.editar`), y una empresa **"Excluir de los reportes"** (convenios
como ANEP PAEMFE o Humphreys; `empresas.editar`). Las cursadas de una empresa
excluida no cuentan en ningún reporte, y la sección avisa cuando hay empresas
excluidas.

**Why this priority**: reemplaza la planilla de métricas que la academia arma
a mano.

**Independent Test**: con datos conocidos, cada reporte coincide con el
cálculo a mano; un grupo que nunca se dictó no cuenta; un curso gratuito no
cuenta como venta; una empresa excluida no aparece; sin `cobranza.ver` la
respuesta no trae ingresos.

**Acceptance Scenarios**:

1. **Given** el período por defecto, **When** se abre el inicio con
   `reportes.ver`, **Then** se ven los reportes con estado de carga y estado
   vacío.
2. **Given** "todo el historial", **When** se elige, **Then** los cursos
   vendidos por año 2020–2023 quedan en el orden de la referencia de la
   academia (2020 = 187, 2021 = 293, 2022 = 327, 2023 = 376), sin coincidir
   exactamente.
3. **Given** una sesión sin `reportes.ver`, **Then** la sección no aparece y
   la ruta responde 403.

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
- Un curso de la planilla que no existe en el catálogo: se guarda como texto,
  figura en el historial y en Recompra, pero no se puede filtrar por él ni abre
  rutas.
- La misma persona con un registro histórico y una inscripción real del mismo
  curso: una sola entrada, gana el dato real.
- Correo de un contacto y teléfono de otro en la misma fila: manda el correo; el
  teléfono no se completa si ya es de otra persona.
- La importación se corta a mitad: se retoma desde donde quedó, sin duplicar.

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

**Importación del historial (US6)**

- **FR-014**: El sistema MUST permitir importar desde la app un CSV de cursadas
  históricas (columnas `nombre, apellido, correo, telefono, empresa, curso,
  curso_original, estudiante, edicion, fecha, vendedor, nota, fila_planilla`),
  sin scripts ni acceso directo a la base.
- **FR-015**: Cada curso distinto MUST asociarse a un curso del catálogo o
  quedar como texto; cada vendedor distinto a un vendedor o a ninguno.
- **FR-016**: Antes de escribir, MUST mostrarse una vista previa con las
  cantidades y las filas con problemas.
- **FR-017**: Un contacto MUST reconocerse por correo normalizado y, si no, por
  teléfono; si no existe se crea con origen `importacion:planilla-2020-2024`.
  De un contacto existente solo se completan campos vacíos (nunca se pisan).
- **FR-018**: La empresa MUST vincularse por nombre exacto normalizado y
  crearse si falta.
- **FR-019**: Una cursada histórica MUST guardarse una sola vez por persona,
  curso y fecha: reimportar no duplica. No se crean grupos ni inscripciones.
- **FR-020**: La importación MUST aplicarse por tandas, retomable, y dejar
  registro de quién la hizo, cuándo y con qué resultado; MUST poder
  deshacerse (se borran sus cursadas; contactos y empresas quedan).
- **FR-021**: El historial comercial MUST contar las cursadas históricas como
  "cursó (registro histórico)": valen para cursó, no hizo, últimos N meses,
  sugerencias y Recompra, pero nunca como "aprobó" ni "cursó sin aprobar".
- **FR-022**: Importar MUST requerir la capacidad `historial.importar`, que
  por defecto solo tiene Dirección.

**Tipo de contacto (US7)**

- **FR-023**: El tipo de un contacto (lead, alumno activo, exalumno) MUST
  derivarse de su historial comercial (FR-001 a FR-003 y FR-021), con
  precedencia alumno activo > exalumno > lead, y no guardarse.
- **FR-024**: Contactos MUST permitir filtrar por tipo en el servidor, con la
  paginación intacta, la cantidad de cada tipo y una insignia por fila.
- **FR-025**: Las audiencias MUST sumar el filtro "tipo de contacto",
  evaluado por el mismo camino de la 045 y con sus exclusiones.

**Reportes (US8)**

- **FR-026**: MUST existir la capacidad `reportes.ver`, otorgada por la
  migración solo a Dirección y Coordinación.
- **FR-027**: El inicio MUST mostrar los reportes de la US8 con un período
  (últimos 12 meses por defecto; "todo el historial"), con estados de carga y
  vacío, en los dos temas.
- **FR-028**: Todo conteo MUST salir de la derivación única del historial:
  los grupos no dictados no cuentan y las cursadas históricas sí, cuando el
  período las cubre.
- **FR-029**: Un curso MUST poder marcarse "Gratuito: no cuenta como venta"
  (`academico.editar`); los reportes de ventas lo excluyen, y "Cursos más
  cursados" lo incluye solo si se pide.
- **FR-030**: Una empresa MUST poder marcarse "Excluir de los reportes"
  (`empresas.editar`); sus cursadas no cuentan en ningún reporte y la sección
  avisa que hay empresas excluidas.
- **FR-031**: Los ingresos por curso MUST consultarse y viajar solo si la
  sesión también tiene `cobranza.ver`.

**Datos**

- **FR-013**: Todo dato nuevo MUST pertenecer a una organización y quedar aislado
  como el resto del sistema.

### Key Entities

- **Ruta entre cursos**: curso de origen, curso siguiente, orden.
- **Cursada comercial** (derivada, no se guarda): contacto, curso, grupo,
  fechas y resultado, según FR-001 a FR-003.
- **Cursada histórica** (US6): contacto, curso del catálogo o texto, fecha,
  empresa, vendedor, si era estudiante, edición, nota, origen y la importación
  que la creó.
- **Importación de historial** (US6): quién, cuándo, archivo, asociaciones,
  avance y resultado.

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
