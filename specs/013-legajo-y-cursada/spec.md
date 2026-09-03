# 013 — Legajo académico y contenido de cursada

**Estado**: **IMPLEMENTADA** (2026-08-27) · **Depende de**: 012 · **Habilita**: 014, 015, 016

> Las 35 tareas de [tasks.md](tasks.md) cerradas. **498 tests** en 59 archivos ·
> self-test E2E **104/104** con la app conectada como `cadit_app`.
> Migraciones 0029 y 0030 aplicadas en desarrollo con backup previo.

## Por qué esta fase existe

Los portales de 014 y 015 no pueden mostrar lo que no existe. Hoy falta el
contenido que una academia le entrega a su gente:

- El alumno no tiene **dónde entrar a su clase**: no hay link de reunión en
  ninguna parte del modelo.
- El calendario dibuja **los días de la semana de la cohorte**, no las clases
  reales: lee `/api/cohorts` y no las `class_session` que creó
  [009](../009-clases-y-asistencia/spec.md). Una clase cancelada sigue
  apareciendo.
- El curso tiene temario (`course_module`) pero **no material**: no hay dónde
  poner la guía, el archivo de ejemplo ni la grabación.
- No hay **anuncios**: avisar "la clase del jueves se pasa al viernes" hoy es
  WhatsApp y nada más.
- El historial de un alumno está **desparramado**: su asistencia en una
  pantalla, sus notas en otra, sus pagos en otra, sus certificados en otra.

Todo esto se construye **para el panel del staff primero**. Cuando lleguen los
portales, exponen algo que ya funciona y está cargado.

## User Scenarios

### US1 — Link de reunión por clase (Priority: P1)

Como alumno quiero entrar a la reunión de mi clase desde la plataforma, y que
el enlace esté visible cuando la clase está por empezar, para no buscar el
link en un chat de WhatsApp de hace tres semanas.

**Escenarios**:
- La cohorte tiene un enlace fijo de Zoom → todas sus clases lo heredan.
- Una clase puntual se dicta en otro enlace → esa clase lo pisa.
- El enlace se muestra desde N minutos antes y hasta que la clase termina.

### US2 — Calendario de clases reales (Priority: P1)

Como coordinación quiero que el calendario muestre las clases del cronograma
—con sus cancelaciones y sus cambios— y no una repetición teórica de días de
la semana.

### US3 — Grabaciones de clase (Priority: P1)

Como alumno que faltó —o que quiere repasar— quiero ver la grabación de una
clase desde la misma lista donde veo las clases que vienen.

**La forma**: una sola lista de clases donde cada fila cambia según el
momento, al estilo de Coderhouse. No dos pantallas separadas.

| Estado de la clase | Qué ofrece la fila |
|---|---|
| Todavía no empieza | fecha y hora, sin enlace |
| Por empezar o en curso | **Entrar a la clase** (enlace de reunión) |
| Terminada, con grabación | **Ver grabación** |
| Terminada, sin grabación | "Grabación pendiente" |
| Cancelada | "Cancelada" + motivo, sin enlaces |

**Por qué en la misma lista**: el alumno no piensa en "clases" y "grabaciones"
como cosas distintas. Piensa en la clase del martes, y quiere entrar —o verla
si ya pasó—.

Como coordinación quiero cargar el enlace de la grabación cuando termina la
clase, y que aparezca solo a los alumnos de esa cohorte.

**Aplica salvo que el curso sea explícitamente asincrónico.** La regla va
invertida a propósito: de los 34 cursos cargados, **20 no tienen modalidad
definida**, 13 son `en_vivo` y 1 `presencial`. Exigir `modality = en_vivo
dejaría sin grabaciones a la mayoría por un campo vacío, no por una decisión.

### US4 — Material de cursada (Priority: P1)

Como profesor quiero publicar el material de cada clase o módulo (enlaces a
guías, ejemplos, grabaciones) para que el alumno lo tenga en un solo lugar.

**Restricción marco**: los recursos son **enlaces**, no archivos subidos. Ver
la decisión de archivos en el [ROADMAP](../ROADMAP.md).

### US5 — Anuncios por cohorte (Priority: P2)

Como coordinación quiero publicar un aviso a una cohorte y que quede
registrado, para que "no me enteré" deje de ser una discusión.

### US6 — Legajo del alumno (Priority: P1)

Como coordinación quiero abrir a una persona y ver **todo** su recorrido en la
academia en una sola pantalla: qué cursó, cuánto asistió, qué aprobó, qué
certificados tiene y cómo está su cuenta.

**Por qué importa**: es la pantalla que hoy no existe y que resume el cambio
de CRM a academia. Un CRM muestra el estado de una venta; una academia
muestra el recorrido de una persona.

## Requirements

- **FR-001**: La cohorte DEBE poder declarar un enlace de reunión por defecto.
- **FR-002**: Una clase DEBE poder pisar ese enlace con el suyo.
- **FR-003**: El enlace DEBE exponerse solo dentro de una ventana alrededor
  del horario de la clase, configurable.
- **FR-004**: El calendario DEBE construirse sobre `class_session`, incluyendo
  el estado de cancelación.
- **FR-005**: Una cohorte sin cronograma generado DEBE seguir mostrándose en
  el calendario por sus días declarados, con una marca visible de que es una
  proyección y no clases reales.
- **FR-005b**: Una clase DEBE poder llevar el enlace de su GRABACIÓN, cargado
  por coordinación o por el profesor.
- **FR-005c**: La lista de clases DEBE ser UNA sola y mostrar, por cada clase,
  la acción que corresponde a su momento: entrar a la clase, ver la grabación,
  o ninguna. No dos pantallas separadas.
- **FR-005d**: La grabación DEBE ser visible SOLO para los inscriptos a esa
  cohorte y para el staff con la capacidad correspondiente.
- **FR-005e**: Una clase cancelada NO DEBE ofrecer grabación ni enlace de
  reunión.
- **FR-005f**: La grabación, como todo recurso, es un ENLACE. El sistema no
  almacena el video (decisión marco de archivos).
- **FR-006**: El material DEBE poder asociarse a un curso (aplica a todas sus
  cohortes) o a una clase puntual.
- **FR-007**: Los recursos son ENLACES con título y tipo. El sistema NO
  almacena el archivo.
- **FR-008**: Un anuncio DEBE registrar autor, fecha y destinatario (cohorte).
- **FR-009**: El legajo DEBE reunir, para un contacto: inscripciones,
  asistencia por cohorte, resultados, certificados y estado de cuenta.
- **FR-010b**: Los horarios de clase DEBEN llevar zona horaria explícita. Hoy
  `start_time`/`end_time` son texto libre sin zona: mientras solo los miraba
  coordinación en Montevideo daba igual, pero **42 alumnos están en Paraguay y
  45 en otros países** (Dominicana, España). Una clase "18:30" tiene que poder
  mostrarse correctamente a quien la mira desde Asunción o Madrid.
- **FR-010c**: El reporte por EMPRESA DEBE poder exportarse: qué empleados
  cursan, su asistencia y su estado de aprobación. Sustituye al portal
  corporativo, que quedó descartado por decisión del dueño (2026-08-26). Hay
  14 inscripciones con empresa y 5 empresas reales.
- **FR-010**: El legajo DEBE respetar las capacidades de 012: quien no ve
  datos financieros, no ve el estado de cuenta dentro del legajo.

## Decisiones a verificar

- **DV-001**: ¿Cuántos minutos antes aparece el enlace de la reunión?
  *(propuesta: 15 minutos antes y hasta 30 después del fin.)*
- **DV-001b**: ¿La grabación caduca? Algunas academias la dejan disponible
  mientras dura la cohorte; otras, para siempre. *(propuesta: mientras el
  alumno conserve acceso al legajo — se resuelve junto con la DV-005 de 012.)*
- **DV-001c**: ¿El profesor puede cargar la grabación o solo coordinación?
  *(propuesta: los dos; el profesor suele tenerla antes.)*
- **DV-002**: ¿El material se asocia a `course_module` (el temario existente)
  o es una entidad independiente? *(propuesta: independiente con referencia
  opcional al módulo — no todo material corresponde a un módulo del temario.)*
- **DV-003**: ¿Los anuncios notifican? Si sí, ¿cómo? Depende de 017.
  *(propuesta: en esta fase solo se registran y se ven; el aviso llega con
  017.)*
- **DV-005**: ¿Dónde vive la zona horaria: en la organización (una sola para
  toda la academia) o en la cohorte? *(propuesta: en la organización —CAD IT
  dicta desde Montevideo—, y el portal convierte a la del navegador del
  alumno.)*
- **DV-004**: ¿El legajo es por `contact` o por `enrollment`? Una persona
  puede haber cursado tres veces. *(propuesta: por contacto, con sus
  inscripciones adentro — es la pregunta que hace el coordinador.)*

## Success Criteria

- **SC-001**: Desde la ficha de una clase se llega a la reunión en un click,
  dentro de la ventana horaria.
- **SC-002**: Cancelar una clase la saca del calendario en el acto.
- **SC-003**: El legajo de un alumno con historial real (de los 340
  importados) se abre y muestra su recorrido completo.
- **SC-004**: Gate técnico en verde.

## Out of Scope

- Subida de archivos (decisión marco: enlaces).
- Reproductor de video propio.
- Foro o comentarios sobre el material (eso es 017).
