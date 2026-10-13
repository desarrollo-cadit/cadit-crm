# Feature Specification: Correcciones configurables y escolaridad automática

**Feature Branch**: `031-correcciones-escolaridad`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Definir cómo se corrige cada evaluación: nota del 1 al 100, campos de texto, varias anotaciones según los ejercicios de la entrega; que alguna corrección pueda requerir la aprobación de alguien del staff; generar la escolaridad de los alumnos automáticamente; y que el alumno vea todo lo que viene de la corrección sin tener que pedir la devolución." (requisitos del dueño, 2026-10-13). Confirmado por el dueño: la escolaridad lista cada evaluación con su nota y el estado final del curso; **no** hace falta una nota final ponderada del curso.

**Depende de**: 010 (evaluaciones, `assessment_result`, `approvalState`,
certificados), 016 (entregas, `corregirEntrega`, devolución visible),
012 (capacidades, RLS), 014/015 (portales del profesor y del alumno),
028 (especializaciones: estado por módulo).

**Revierte**: DV-001 del ciclo 010 ("la escala es APROBADO / NO APROBADO, sin
nota numérica"). La reversión es **compatible**: toda evaluación existente
sigue siendo aprobado/no aprobado y todo lo que hoy lee "aprobó o no" sigue
leyendo lo mismo.

## Contexto

Hoy una corrección es un sí/no más un párrafo. Eso alcanza para un trabajo
práctico, pero no para una entrega con cinco ejercicios: el profesor termina
escribiendo la nota y el detalle por WhatsApp, el alumno lo pide de nuevo
cuando lo pierde y la academia no tiene registro de nada. Tampoco hay forma de
que una corrección sensible (un final, una recuperación) pase por coordinación
antes de que el alumno la vea. Y la escolaridad —el listado de lo que el
alumno cursó y cómo le fue— se arma a mano cada vez que alguien la pide.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Definir cómo se corrige una evaluación (Priority: P1)

Quien gestiona lo académico define, para cada evaluación de una cohorte, su
**plantilla de corrección**: la escala (aprobado/no aprobado, o numérica de 1 a
100 con una nota mínima para aprobar), los **ejercicios o criterios** que la
componen —cada uno con su puntaje máximo— y los **campos de texto** que el
corrector tiene que completar (por ejemplo "Fortalezas", "A mejorar").

**Why this priority**: Sin plantilla no hay nada que corregir distinto de hoy;
todo lo demás se apoya en ella.

**Independent Test**: Crear una evaluación numérica con tres ejercicios (40 +
30 + 30) y un campo de texto, y comprobar que la plantilla queda guardada y se
ve igual al volver a abrirla. Una evaluación existente sin tocar sigue siendo
aprobado/no aprobado.

**Acceptance Scenarios**:

1. **Given** una evaluación nueva, **When** el coordinador elige escala numérica con mínimo 60 y agrega tres ejercicios que suman 100, **Then** la plantilla queda guardada y la evaluación muestra "Numérica · aprueba con 60".
2. **Given** una plantilla numérica con ejercicios, **When** los puntajes máximos no suman 100, **Then** el sistema no la guarda y dice cuánto suman y cuánto falta o sobra.
3. **Given** una evaluación creada antes de este ciclo, **When** alguien la abre, **Then** su escala es aprobado/no aprobado, sin ejercicios, y su resultado se lee igual que antes.
4. **Given** una evaluación con al menos una corrección publicada, **When** el coordinador intenta cambiar la escala, la nota mínima o los ejercicios, **Then** el sistema lo impide y explica que ya hay correcciones publicadas; los textos de ayuda y los nombres sí pueden corregirse.
5. **Given** la acción "copiar evaluaciones de otra cohorte", **When** se copia una evaluación con plantilla, **Then** la copia trae su escala, sus ejercicios y sus campos de texto.

---

### User Story 2 - Corregir con nota, ejercicios y comentarios (Priority: P1)

El profesor (desde su portal) o alguien del staff abre la entrega de un alumno
y completa la corrección según la plantilla: puntaje y comentario por
ejercicio, los campos de texto y una devolución general. La nota final y el
"aprobó / no aprobó" salen solos.

**Why this priority**: Es el trabajo de todos los días y la razón del pedido.

**Independent Test**: Corregir una entrega con 35/40, 20/30 y 25/30 y un
comentario por ejercicio; comprobar que la nota es 80, figura "Aprobada" (mínimo
60) y que el resultado de la evaluación en la planilla de la cohorte dice
aprobado.

**Acceptance Scenarios**:

1. **Given** una plantilla numérica con ejercicios, **When** el corrector carga los puntajes de cada ejercicio, **Then** la nota final es la suma y el estado aprobado/no aprobado se deriva de la nota mínima.
2. **Given** una plantilla numérica sin ejercicios, **When** el corrector carga la nota directamente, **Then** el sistema acepta solo enteros de 1 a 100.
3. **Given** un puntaje mayor al máximo del ejercicio, **When** el corrector guarda, **Then** el sistema lo rechaza indicando cuál ejercicio y su máximo.
4. **Given** una corrección a medio hacer, **When** el corrector la guarda como borrador, **Then** queda guardada, NO cambia el resultado oficial y el alumno no la ve.
5. **Given** un alumno que no entregó por el sistema (corrección hecha por fuera), **When** el corrector carga su resultado, **Then** puede usar la misma plantilla sin que exista una entrega.
6. **Given** una evaluación aprobado/no aprobado, **When** el corrector corrige, **Then** el flujo es el de hoy (sí/no + devolución) más los campos de texto que la plantilla tenga.

---

### User Story 3 - El alumno ve toda la corrección publicada (Priority: P1)

El alumno abre su cursada en el portal y, en cada evaluación corregida y
publicada, ve la nota, el detalle por ejercicio (puntaje obtenido, máximo y
comentario), los campos de texto y la devolución general, con quién la corrigió
y cuándo.

**Why this priority**: Es lo que elimina el "¿me pasás la devolución?" por
WhatsApp, que es el dolor que dio origen al pedido.

**Independent Test**: Publicar una corrección con ejercicios y entrar al portal
como ese alumno: ve todo el detalle. Dejar otra en borrador: el alumno no ve
nada de ella, ni siquiera que existe.

**Acceptance Scenarios**:

1. **Given** una corrección publicada, **When** el alumno abre la evaluación, **Then** ve nota, estado, cada ejercicio con su puntaje sobre el máximo y su comentario, los campos de texto y la devolución general.
2. **Given** una corrección en borrador o pendiente de aprobación, **When** el alumno abre la evaluación, **Then** la ve como "Pendiente de corrección", sin nota, sin comentarios y sin indicio de que hay algo cargado.
3. **Given** una corrección publicada que luego se corrige y se vuelve a publicar, **When** el alumno la abre, **Then** ve la versión vigente.
4. **Given** un alumno cualquiera, **When** consulta su portal, **Then** nunca recibe correcciones de otro alumno.

---

### User Story 4 - Aprobar una corrección antes de publicarla (Priority: P2)

Para las evaluaciones marcadas como "requiere aprobación", quien corrige no
publica: envía la corrección a aprobación. Alguien del staff con permiso para
aprobar la revisa y la **aprueba** (se publica) o la **devuelve** con un
comentario para el corrector.

**Why this priority**: Importante para finales y recuperaciones, pero la
mayoría de las evaluaciones se publican directo; el resto del ciclo funciona
sin esto.

**Independent Test**: Marcar una evaluación como "requiere aprobación",
corregir como profesor y enviar; verificar que el alumno no ve nada y el
resultado oficial no cambió; aprobar como staff y verificar que el alumno ve la
corrección y la planilla tiene el resultado.

**Acceptance Scenarios**:

1. **Given** una evaluación que requiere aprobación, **When** el profesor termina la corrección, **Then** su única opción es "Enviar a aprobación" y la corrección queda "Pendiente de aprobación".
2. **Given** correcciones pendientes, **When** alguien con permiso de aprobar entra a su bandeja, **Then** ve la lista con alumno, evaluación, cohorte, corrector y fecha de envío.
3. **Given** una corrección pendiente, **When** el aprobador la aprueba, **Then** queda publicada, el resultado oficial se actualiza y el alumno la ve.
4. **Given** una corrección pendiente, **When** el aprobador la devuelve con un comentario, **Then** vuelve a borrador, el corrector ve el comentario y el alumno sigue sin ver nada.
5. **Given** alguien con permiso de aprobar que corrige él mismo, **When** termina la corrección, **Then** puede publicarla directamente.
6. **Given** una corrección publicada en una evaluación que requiere aprobación, **When** alguien la modifica, **Then** el cambio vuelve a pasar por aprobación y, mientras tanto, el alumno sigue viendo la versión publicada anterior.
7. **Given** cualquier aprobación o devolución, **When** se consulta la corrección, **Then** queda registrado quién y cuándo la aprobó o devolvió.

---

### User Story 5 - Escolaridad generada automáticamente (Priority: P2)

El staff abre la escolaridad de un alumno y ve, por cada curso que cursó en la
academia, cada evaluación con su nota (o aprobado/no aprobado) y el estado
final del curso. La puede imprimir o guardar como PDF. El alumno ve la suya en
el portal.

**Why this priority**: Ahorra el armado a mano, pero depende de que existan
notas publicadas (US2/US3).

**Independent Test**: Un alumno con dos cursos (uno terminado y aprobado, otro
en curso con una evaluación pendiente) tiene una escolaridad con los dos
cursos, las notas publicadas y los estados "Aprobado" y "En curso"; al
imprimirla sale en una página legible sin elementos de navegación.

**Acceptance Scenarios**:

1. **Given** un alumno con cursadas, **When** el staff abre su escolaridad, **Then** ve cada curso con su cohorte y período, cada evaluación con su nota publicada y el estado final del curso.
2. **Given** una evaluación sin corrección publicada, **When** aparece en la escolaridad, **Then** figura "Pendiente", nunca como desaprobada ni con nota cero.
3. **Given** un curso cuyo estado depende de evaluaciones pendientes o asistencia sin cargar, **When** aparece en la escolaridad, **Then** figura "En curso" o "Sin datos", nunca "Aprobado" por omisión.
4. **Given** un programa de especialización, **When** aparece en la escolaridad, **Then** se listan sus módulos con sus evaluaciones y el estado del programa según las reglas de 028.
5. **Given** la escolaridad en pantalla, **When** se elige imprimir o guardar como PDF, **Then** el documento lleva nombre del alumno, documento de identidad si está cargado, academia, fecha de emisión y las cursadas, sin barras ni botones.
6. **Given** un alumno en el portal, **When** abre "Mi escolaridad", **Then** ve exactamente lo mismo que el staff, sin datos de cobranza.
7. **Given** una nota que cambia después, **When** se vuelve a abrir la escolaridad, **Then** refleja el dato vigente (se calcula al mostrarla, no se guarda una copia).

---

### Edge Cases

- Una evaluación numérica cuyos ejercicios suman 100 pero el corrector deja un ejercicio sin puntaje: no se puede publicar ni enviar a aprobación; sí guardar como borrador.
- Nota justo en la mínima (60 con mínimo 60): aprueba.
- Se cambia "requiere aprobación" a desactivado con correcciones pendientes: las pendientes siguen esperando aprobación; las nuevas se publican directo.
- Se reabre una entrega (016) después de publicada la corrección: la corrección publicada sigue visible; la nueva entrega se corrige con una corrección nueva.
- El aprobador devuelve una corrección y el corrector ya no tiene acceso a la cohorte (suplencia terminada): la corrección queda en borrador visible para el staff.
- Cohorte finalizada: no se pueden crear ni modificar correcciones desde el portal del profesor (regla vigente de 014); el staff sí.
- Alumno dado de baja: su escolaridad sigue disponible para el staff y muestra la cursada con su estado.
- Una evaluación opcional (no obligatoria) aparece en la escolaridad con su nota, pero no define el estado final.

## Requirements *(mandatory)*

### Functional Requirements

**Plantilla de corrección**

- **FR-001**: Cada evaluación DEBE tener una escala: `aprobado/no aprobado` o `numérica 1–100`. Las evaluaciones existentes DEBEN quedar como `aprobado/no aprobado` sin intervención.
- **FR-002**: Una evaluación numérica DEBE declarar una nota mínima de aprobación (entero 1–100).
- **FR-003**: Una evaluación numérica PUEDE declarar ejercicios/criterios ordenados, cada uno con nombre y puntaje máximo entero; si declara alguno, los máximos DEBEN sumar exactamente 100.
- **FR-004**: Cualquier evaluación PUEDE declarar campos de texto con nombre, en orden, marcados como obligatorios u opcionales.
- **FR-005**: Escala, nota mínima y ejercicios NO DEBEN poder cambiarse una vez que la evaluación tenga al menos una corrección publicada; nombres y textos de ayuda sí.
- **FR-006**: Copiar evaluaciones entre cohortes (010/015) DEBE copiar la plantilla completa.
- **FR-007**: Cada evaluación DEBE poder marcarse como "requiere aprobación" (por defecto: no).

**Corrección**

- **FR-008**: Una corrección DEBE registrar, según la plantilla: puntaje y comentario por ejercicio, valor de cada campo de texto, devolución general, y la nota o el aprobado/no aprobado.
- **FR-009**: Con ejercicios, la nota final DEBE ser la suma de los puntajes; sin ejercicios, el corrector la carga directamente.
- **FR-010**: En escala numérica, "aprobó" DEBE derivarse de nota ≥ mínima; nadie lo carga a mano.
- **FR-011**: Una corrección DEBE tener estado `borrador`, `pendiente de aprobación` o `publicada`.
- **FR-012**: El resultado oficial de la evaluación (el que leen la planilla de la cohorte, el legajo, los certificados y el estado de aprobación del curso) DEBE actualizarse **solo al publicar**. Un borrador o una corrección pendiente no lo cambian.
- **FR-013**: Publicar o enviar a aprobación DEBE exigir todos los ejercicios con puntaje y todos los campos obligatorios completos; guardar borrador no.
- **FR-014**: Una corrección DEBE poder cargarse con o sin entrega asociada (corrección hecha por fuera del sistema).
- **FR-015**: Profesores corrigen solo dentro de su alcance (titular o suplente de la cohorte, regla de 014); ausencia de alcance responde "no encontrado", nunca "prohibido".
- **FR-016**: La devolución y los comentarios para el alumno DEBEN seguir separados de la nota interna del staff (FR-011 de 016).

**Aprobación**

- **FR-017**: DEBE existir una capacidad nueva para aprobar correcciones, asignable a roles desde la pantalla de roles; ninguna regla puede depender del nombre de un rol.
- **FR-018**: En una evaluación que requiere aprobación, quien no tiene esa capacidad DEBE enviar a aprobación en vez de publicar; quien la tiene puede publicar directo.
- **FR-019**: El aprobador DEBE poder aprobar (publica) o devolver con comentario obligatorio (vuelve a borrador, visible para el corrector).
- **FR-020**: DEBE existir una bandeja de correcciones pendientes de aprobación, filtrable por cohorte.
- **FR-021**: Modificar una corrección publicada de una evaluación que requiere aprobación DEBE crear una versión nueva que pasa por aprobación; la versión publicada anterior sigue vigente hasta que la nueva se apruebe.
- **FR-022**: DEBE registrarse quién corrigió, quién envió, quién aprobó o devolvió, y cuándo.

**Lo que ve el alumno**

- **FR-023**: El portal del alumno DEBE mostrar, de cada corrección publicada propia: nota o estado, ejercicios con puntaje/máximo/comentario, campos de texto, devolución general, corrector y fecha.
- **FR-024**: Ningún dato de una corrección en borrador o pendiente DEBE llegar al portal del alumno (no se consulta ni se envía; no basta con esconderlo).
- **FR-025**: Lo que el alumno ve de una evaluación sin corrección publicada DEBE ser "Pendiente", nunca "No aprobada".

**Escolaridad**

- **FR-026**: La escolaridad DEBE calcularse al mostrarla a partir de las cursadas, los resultados oficiales y la asistencia; NO se guarda una copia.
- **FR-027**: DEBE listar por cursada: curso, cohorte, período, cada evaluación (nota numérica, o aprobado/no aprobado, o "Pendiente") y el estado final del curso con las reglas existentes (010/028), incluido "Sin datos" cuando no hay nada cargado.
- **FR-028**: NO DEBE calcular una nota final ponderada del curso.
- **FR-029**: DEBE poder imprimirse o guardarse como PDF desde el navegador con un formato de documento (encabezado con academia, alumno, documento si está cargado y fecha de emisión).
- **FR-030**: El staff DEBE verla desde la ficha del alumno con la capacidad académica de lectura; el alumno DEBE ver la propia en su portal. Ninguna de las dos incluye datos de cobranza.

### Key Entities

- **Plantilla de corrección** (parte de la evaluación): escala, nota mínima, si requiere aprobación, lista ordenada de ejercicios (nombre, puntaje máximo) y de campos de texto (nombre, obligatorio).
- **Corrección**: de un alumno en una evaluación; opcionalmente ligada a una entrega. Tiene estado (borrador / pendiente / publicada), nota, aprobó (derivado), devolución general, puntajes y comentarios por ejercicio, valores de los campos de texto, y el registro de quién corrigió, envió, aprobó o devolvió. Puede haber una versión publicada vigente y una versión nueva en trámite.
- **Resultado oficial** (existente, 010): pasa a llevar también la nota numérica cuando la escala es numérica. Solo lo escribe una publicación.
- **Escolaridad**: vista derivada por alumno; no es una entidad guardada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un profesor corrige una entrega de 5 ejercicios, con comentario en cada uno, en menos de 5 minutos sin salir del sistema.
- **SC-002**: El 100% de las correcciones publicadas son visibles para su alumno con todo su detalle, sin intervención del staff.
- **SC-003**: Ninguna corrección en borrador o pendiente es visible para el alumno ni altera el resultado oficial (verificado por pruebas automáticas).
- **SC-004**: El staff obtiene la escolaridad imprimible de cualquier alumno en menos de 30 segundos, sin armarla a mano.
- **SC-005**: Todas las evaluaciones y certificados existentes muestran, después del cambio, el mismo resultado que antes.
- **SC-006**: Las consultas de alumnos pidiendo su devolución por WhatsApp bajan notoriamente en el mes siguiente al lanzamiento (medición cualitativa del equipo).

## Assumptions

- La nota es un entero de 1 a 100; no hay decimales ni otras escalas (1–12, letras) en este ciclo.
- Con ejercicios, la nota es la suma de puntajes; no hay ponderaciones adicionales dentro de una evaluación.
- "Requiere aprobación" se define por evaluación, no por curso ni por organización.
- Quien tiene la capacidad de aprobar puede publicar sus propias correcciones sin un segundo aprobador.
- La escolaridad es un documento **informativo** imprimible, no un documento verificable con código público (eso queda para un ciclo futuro si hace falta; los certificados de 010 ya cubren la verificación).
- El PDF se obtiene con la impresión del navegador; no se genera del lado del servidor (sin dependencias externas nuevas, constitución II).
- Las cursadas que no tienen evaluaciones aparecen en la escolaridad con su estado final según asistencia y, si no hay datos, "Sin datos".
- Los cursos offline (autoasistidos, con cuestionarios) quedan fuera de la escolaridad en este ciclo.
