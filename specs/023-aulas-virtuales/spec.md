# 023 — Aulas virtuales y choques de horario

**Estado**: implementada, **corregida por la 025** · **Depende de**: 009, 013 ·
**Habilita**: 018 (opcional)

> **Corrección (025)**: esta spec puso la URL de la reunión en el AULA, y
> estaba mal. La academia crea una reunión **recurrente por cohorte**: cada
> cohorte tiene su propia URL aunque comparta cuenta de Zoom con otra.
>
> Con la URL en el aula, dos cohortes asignadas a la misma cuenta compartían
> enlace y un alumno podía entrar a la clase de la otra. La "consecuencia
> asumida" que se escribió más abajo subestimaba eso: la ventana horaria
> limita cuándo se MUESTRA el enlace, no a dónde lleva.
>
> Lo que queda en pie: el aula como **cuenta** y el detector de choques. Lo
> que cambia: el enlace sale de `cohort.meeting_url` (o del de la clase), y
> el aula NO participa de esa cadena. Ver FR-004 corregido.

## Por qué esta fase existe

La academia dicta en vivo con **5 cuentas de Zoom**. Hoy el sistema no sabe
que existen: `cohort.meeting_url` es un texto libre, y **0 de las 41 cohortes
lo tienen cargado**. Eso deja cuatro preguntas sin respuesta dentro del
sistema, que hoy se contestan de memoria o en una planilla aparte:

- ¿Qué aula usa esta clase?
- ¿Qué profesor está en cada aula, y a qué hora?
- ¿Se pisan dos clases en la misma aula?
- ¿Cuántas aulas quedan libres el martes a las 18:30?

La cuarta es la que duele: con 5 aulas y 41 cohortes, **la pregunta no es si se
van a pisar, es cuándo**. Y cuando pasa, se entera el alumno.

## La decisión que define la fase

**Esto NO es una integración con Zoom.** Es un problema de calendario, y se
resuelve con los datos que el sistema ya tiene.

Una cuenta de Zoom tiene un **PMI** (Personal Meeting ID): una sala permanente
con una URL fija. Cinco cuentas son cinco URLs. Modeladas como recurso, el
choque se detecta comparando rangos horarios —`class_session.date` +
`start_time` + `end_time`, compuestos con `classInstant()`, que ya existe,
maneja zona horaria y está probado contra el cambio de hora—.

Lo que la API de Zoom agregaría es **otra cosa**: reunión única por clase en
vez del PMI fijo, y la grabación adjudicada sola por webhook. Eso es la
[018](../018-zoom-automatico/spec.md), sigue siendo opcional, y **exige una
cuarta dependencia de runtime**. Esta fase no la necesita ni la bloquea: si
algún día se conecta, el aula deja de ser un PMI y pasa a ser el proveedor que
emite la reunión, sin cambiar quién la usa ni cómo se detecta el choque.

**Corregido por la 025**: el aula NO aporta el enlace. Su PMI es una sala
genérica de la cuenta, compartida por todas las cohortes que la usan, así que
usarlo como respaldo mandaba al alumno a la clase equivocada. El enlace sale
de la reunión recurrente de la cohorte, y si no está cargada el portal dice
que no hay enlace: **mejor no mostrar ninguno que mostrar el equivocado**.

El aula conserva su `url` como dato administrativo de coordinación —a qué
sala pertenece la cuenta— y no viaja como "entrar" a ningún portal.

## User Scenarios

### US1 — Declarar las aulas (Priority: P1)

Como coordinación quiero cargar mis 5 aulas virtuales con su nombre y su
enlace, para dejar de pegar URLs sueltas en cada cohorte.

**Escenarios**:
- Aula con nombre y enlace → queda disponible para asignar.
- Aula dada de baja → no se puede asignar a clases nuevas, y las clases
  pasadas que la usaron **conservan el registro**: es evidencia de dónde se
  dictó, no un dato descartable.

### US2 — Asignar un aula a una cohorte (Priority: P1)

Como coordinación quiero asignarle un aula a la cohorte, y que todas sus clases
la hereden, para no elegirla cuarenta veces.

**Regla**: la clase HEREDA el aula de la cohorte, no se la copia. Copiarla al
generar el cronograma dejaría 41 cohortes con aulas congeladas el día que se
reasigne una — el mismo error que 013 evitó con `meeting_url`.

### US3 — Ver los choques ANTES de que pasen (Priority: P1)

Como coordinación quiero que el sistema me avise cuando dos clases comparten
aula y horario, en el momento en que lo estoy armando.

**Escenarios**:
- Al generar el cronograma de una cohorte → si alguna clase choca, se dice
  cuáles y contra qué, y **el cronograma se genera igual**: el choque es un
  aviso, no un bloqueo. Coordinación sabe cosas que el sistema no (que esa
  clase se movió, que ese día es feriado).
- Al asignar o cambiar el aula de una cohorte → mismo aviso, en el momento.
- Una clase **cancelada** no choca con nada.

### US4 — La agenda de las aulas (Priority: P1)

Como coordinación quiero ver, para un día o una semana, qué aula está ocupada
por quién y con qué clase, para poder reubicar sin adivinar.

### US5 — Cambiar el aula de UNA clase (Priority: P2)

Como coordinación quiero mover una sola clase a otra aula sin tocar el resto
de la cohorte, porque los choques se resuelven de a una.

### US6 — El alumno entra a su clase (Priority: P1)

Como alumno quiero entrar a la clase desde mi portal sin buscar el link en un
chat viejo.

**Ya está construido** ([015](../015-portal-alumno/spec.md) US2 y `buildClassRow`):
esta fase solo hace que el enlace exista, porque hoy las 41 cohortes lo tienen
vacío.

### US7 — El profesor sabe dónde dicta (Priority: P2)

Como profesor quiero ver en qué aula me toca y entrar desde ahí.

## Requirements

- **FR-001**: Un aula virtual DEBE tener nombre, enlace y estado (activa o de
  baja). El nombre es lo que ve coordinación; el enlace, lo que abre el alumno.
- **FR-002**: Una cohorte PUEDE declarar un aula. Sus clases la HEREDAN; no se
  les copia.
- **FR-003**: Una clase PUEDE declarar su propia aula, y esa gana sobre la de
  la cohorte. Mismo criterio que `meeting_url` en 013.
- **FR-004** *(corregido por la 025)*: El enlace que ve el alumno DEBE
  resolverse en DOS escalones: **enlace propio de la clase → enlace de la
  cohorte**. El aula no participa. Sin ninguno de los dos, no se muestra
  enlace — nunca se cae a la sala de la cuenta, que es compartida.
- **FR-005**: El sistema DEBE detectar choques: dos clases NO canceladas, con
  la MISMA aula, cuyos rangos horarios se solapan.
- **FR-006**: El choque DEBE avisarse, nunca bloquear. Coordinación decide.
- **FR-007**: Los rangos se comparan como INSTANTES, con `classInstant()`.
  Comparar los textos `"18:30"` sin zona da falsos negativos en el cambio de
  hora y falsos positivos entre cohortes de zonas distintas.
- **FR-008**: Una clase sin horario cargado NO puede chocar: no hay rango que
  comparar. **6 de las 41 cohortes no tienen horario**, y suponerles uno sería
  inventar un choque o esconderlo.
- **FR-009**: Un aula dada de baja NO DEBE poder asignarse a nada nuevo, y las
  clases que ya la tenían la conservan.
- **FR-010** *(corregido por la 025)*: El portal del profesor DEBE mostrar en
  qué aula le toca, como ETIQUETA y no como enlace de entrada: la sala del
  aula es compartida. Para entrar está el enlace de cada clase. Nunca se
  muestran la cuenta ni las credenciales.
- **FR-011**: La agenda de aulas DEBE poder consultarse por día y por semana,
  diciendo aula, horario, cohorte y profesor.
- **FR-012**: Toda la superficie es de STAFF salvo el enlace, que llega a los
  portales por los DTO que ya existen.

## Decisiones a verificar

- **DV-001**: ¿El aula se asigna por cohorte o por día de la semana? Una cohorte
  que dicta lunes y miércoles podría querer aulas distintas.
  *(propuesta: por cohorte, con excepción por clase (FR-003). Por día de la
  semana es una tercera dimensión que nadie pidió y que hay que llenar 41
  veces.)*
- **DV-002**: ¿El choque se calcula al vuelo o se persiste?
  *(propuesta: al vuelo, como el estado de una cuota (008/DV-003). Persistirlo
  obliga a recalcular cada vez que se mueve una clase, y un choque marcado que
  ya no existe es peor que no tener el dato.)*
- **DV-003**: ¿Cuánto margen entre clases cuenta como choque? Dos clases
  pegadas (20:30 fin / 20:30 inicio) técnicamente no se solapan, pero en la
  práctica la primera se estira.
  *(propuesta: solapamiento estricto, y un margen configurable por
  organización con default 0. Inventar 15 minutos de colchón haría aparecer
  choques que coordinación sabe que no existen.)*
- **DV-004**: ¿Se avisa al profesor cuando su clase quedó en choque?
  *(propuesta: no en esta fase. Avisar es 017, que está fuera de alcance por
  decisión del dueño.)*
- **DV-005**: ¿Cuántas aulas hay realmente? La spec asume 5 (las cuentas de
  Zoom), pero el modelo no impone un tope.

## Success Criteria

- **SC-001**: Coordinación carga las 5 aulas y las asigna sin escribir una URL
  más de una vez.
- **SC-002**: Generar el cronograma de una cohorte cuyo horario pisa a otra en
  la misma aula devuelve el cronograma **y** la lista de choques.
- **SC-003**: Dos clases pegadas (una termina cuando la otra empieza) NO se
  reportan como choque.
- **SC-004**: Una clase cancelada no aparece en ningún choque.
- **SC-005**: Un alumno abre su portal y el botón de entrar lleva al aula
  correcta, dentro de la ventana horaria.
- **SC-006**: Dos cohortes en zonas horarias distintas que caen en el mismo
  instante real SÍ se reportan como choque, verificado por test.

## Out of Scope

- Crear reuniones por la API de Zoom (es la 018).
- Traer grabaciones automáticamente (es la 018).
- Reservar aulas físicas. `cohort.classroom` ya existe como texto y no se
  toca: son dos problemas distintos y mezclarlos obliga a modelar el edificio.
- Avisar por chat o correo cuando aparece un choque (es la 017, fuera de
  alcance por decisión del dueño).
- Asistencia a partir de la participación en Zoom.
