# 028 — Especializaciones y módulos

**Estado**: propuesta · **Depende de**: 013, 023 · **Habilita**: 016

## Por qué esta fase existe

**100 de las 384 inscripciones —el 26%— están en cursos que son programas de
varios módulos, y el sistema no lo sabe.** Son 7 cursos y 9 cohortes, medidos
contra la base de producción el 2026-09-07. No es un caso de borde: es un
cuarto de la matrícula.

La estructura existe HOY, pero como **texto adentro de `course.name`**. Filas
reales del catálogo, sin retocar:

- `"Revit Arq + Revit Estructura + Revit MEP"` — tres nombres de módulo
  concatenados con `+`.
- `"Taller DOCS + BIM Coll- 1"` y `"Taller DOCS + BIM Coll- 2"` — la parte se
  numera en el nombre, con guion y todo.
- `"Taller BONITA BEACH 1"` y `"Taller BONITA BEACH 2"`.
- `"Especialización en Proyectos BIM"` y `"Especialización Proyecto Ejecutivo
  con Revit"`.

Y las cohortes que las ejecutan: `EBIM 13` (16 alumnos, del 2026-04-22 al
2026-12-20, **ocho meses**), `2025 - EBIM V.12` (18 alumnos), `EBIM 14` (3
alumnos), `Proyecto Ejecutivo con REVIT` (5 alumnos). Un curso de la academia
dura semanas. Estos duran meses, porque no son cursos: son **programas**.

Cuando la estructura vive en el nombre, el sistema no puede responder ninguna
de las preguntas que la estructura genera. Cuál es el módulo 2. Quién lo
dicta. Qué evaluaciones son de ese módulo y cuáles del siguiente. Cómo va un
alumno **por módulo**. Quién aprobó el módulo 1 y debe recursar el 3.

**Y hay un dato que lo cierra: esas 9 cohortes tienen CERO filas en
`class_session`.** Ninguna. La academia **no está usando el sistema para
dictar sus especializaciones** — las lleva por fuera, porque adentro no entran.

Ese cero es a la vez el argumento más fuerte de esta fase y su riesgo
principal, y conviene decir las dos mitades:

- Es el argumento, porque prueba que el problema no es cosmético. Con la
  estructura ausente, cargar ocho meses de clases en una sola cohorte plana
  —sin poder decir a qué módulo pertenece cada una ni quién la dicta— es peor
  que no cargarlas. La gente eligió no cargarlas, y tenía razón.
- Es el riesgo, porque **esta fase no tiene datos que arreglar: tiene un uso
  que ganar**. No hay 9 cohortes mal cargadas para migrar; hay 9 cohortes
  vacías que alguien tiene que decidirse a llenar. Si el modelo queda bien y
  nadie carga un cronograma, la fase no sirvió para nada. Por eso los Success
  Criteria de acá abajo se escriben sobre una especialización real cargada
  entera, y no sobre una de prueba.

## Las decisiones que definen la fase

Las reglas de negocio de las decisiones 2, 3 y 4 las dio el **dueño el
2026-09-07** y no se reabren en esta fase. Están escritas acá, con su
consecuencia técnica, y **no** figuran como preguntas abiertas más abajo.

### 1. Un módulo es una COHORTE, no un curso

Un módulo de una especialización tiene profesor propio, fechas propias, clases
propias, evaluaciones propias, asistencia propia y enlace de reunión propio.
Eso no se parece a una cohorte: **es exactamente una cohorte**, tal como el
sistema la tiene definida desde el ciclo 004.

Un `course`, en cambio, es una entrada de **catálogo**: precio de lista,
`slug`, `published`, ficha pública en el sitio comercial, temario, categoría.

**Mecanismo**: dos columnas nuevas en `cohort`.

- `parent_cohort_id` — auto-referencia nullable a `cohort.id`. La camada de la
  especialización es el **padre**; cada módulo es una cohorte **hija**.
- `position` — el orden del módulo dentro del programa. "Módulo 2" tiene que
  ser un número, no una inferencia sobre fechas: dos módulos pueden solaparse
  y el orden pedagógico sigue siendo el que la academia decidió.

Lo que se obtiene **sin ningún otro cambio de esquema**, porque ya existe:

| Se necesita | Ya lo resuelve |
|---|---|
| Profesor por módulo | `cohort.teacher_id` — una columna por cohorte, y ahora hay una cohorte por módulo |
| Clases por módulo | `class_session.cohort_id` |
| Evaluaciones por módulo | `assessment.cohort_id` |
| Enlace de reunión por módulo | `cohort.meeting_url` — la 025 dejó la URL en la COHORTE, no en el aula |
| Aula virtual y detector de choques por módulo | `cohort.virtual_room_id` (023) |
| Suplencia dentro de un módulo | `class_session.teacher_id` (009) |
| Mínimo de asistencia propio | `cohort.min_attendance_pct` (009) |

Siete capacidades ya escritas, probadas y en producción, que aparecen de golpe
**por haber elegido bien el nodo del árbol**. Esta fase no agrega maquinaria:
reusa la que hay.

**Alternativa rechazada — `course.parent_id`** (el módulo como curso hijo). Es
la que sale primero, y es peor en todos los ejes:

- **Ensucia el catálogo.** Cada módulo sería una fila de `course` con `slug`,
  `list_price`, `published` y ficha pública — campos que hay que llenar con
  algo, para algo que en la venta normal no se compra suelto.
  `published=false` en todos es la confesión de que la fila no debería existir.
- **No alcanza igual.** Un curso no tiene profesor, ni fechas, ni clases. Bajo
  cada curso-módulo habría que crear una cohorte de todos modos: se paga la
  fila del catálogo **y** la de la cohorte.
- **No representa la recursada** (decisión 3). Que alguien curse el módulo 3
  en la EBIM siguiente es un hecho sobre una **corrida concreta**, y un curso
  no tiene corridas: las tienen las cohortes.

Queda registrada como rechazada, con su motivo, para que no vuelva a
proponerse dentro de seis meses como si fuera nueva.

### 2. Las reglas del recorrido, dictadas por el dueño (2026-09-07)

Seis reglas, textuales en sustancia. No son detalles de interfaz: son las que
determinan el modelo de datos, y por eso van antes que él.

1. **Un certificado POR MÓDULO.** Además, el certificado **general** de la
   especialización se entrega sólo si aprobó **todos** los módulos.
2. **Reprobar un módulo NO bloquea.** La persona sigue cursando los demás.
   Recibe los certificados de los módulos que aprobó, y no recibe el general.
3. **Baja voluntaria de un módulo** —falta de tiempo, enfermedad; ya les
   pasó— : la persona puede **sumarse a ese módulo en la EBIM siguiente**.
4. **Si reprobó un módulo**, puede **abonar ese módulo** y subirse a otra EBIM
   para recursarlo. Hay, entonces, un pago por módulo suelto en el camino de
   recuperación.
5. **Asistencia y aprobación son POR MÓDULO.**
6. **La asistencia admite una excepción habilitada por una persona.** Textual:
   *"puede pasar que por alguna particularidad no cumpla con el 80% de
   asistencia, por ejemplo avisó antes del inicio que se iba de viaje, y
   dependiendo del módulo capaz Sergio habilita a que pueda aprobarlo"*. Es la
   decisión 4 de esta fase.

Las reglas 1, 2 y 5 estaban listadas como preguntas abiertas en el planteo
anterior de esta fase. Ya no lo son: están resueltas y bajaron acá. La 6 es
nueva y cambia una regla que hasta hoy era dura.

### 3. DOS auto-referencias: la estructura y el recorrido

Acá está el corazón de la fase, y conviene decir primero qué se descartó.

**Lo que NO alcanza: "la inscripción vive en la camada padre".** Es la
solución obvia bajo el paquete cerrado —una inscripción a la especialización,
que lleva el plan de cuotas, y los módulos colgando de la estructura—. Muere
contra las reglas 3 y 4: la participación de una persona en un módulo puede
apuntar a un módulo de **otra** camada (la EBIM siguiente) **y** puede tener
un pago propio. Una sola fila de `enrollment` colgada del padre no tiene dónde
guardar ninguna de las dos cosas. No es que quede incómodo: **no es
representable**.

Entonces son **dos** auto-referencias, y responden dos preguntas distintas:

| Columna | Pregunta que responde | Vive en |
|---|---|---|
| `cohort.parent_cohort_id` + `position` | **Cómo está armado el programa**: EBIM 13 tiene 4 módulos, en este orden | La estructura |
| `enrollment.parent_enrollment_id` (nuevo, nullable) | **Qué recorrió esta persona**: qué corrida de cada módulo cursó | El recorrido |

- La inscripción **madre** apunta a la camada de la especialización y lleva el
  **paquete cerrado**: monto, moneda y plan de cuotas de la venta.
- Hay una inscripción **hija** por cada módulo cursado. Su `cohort_id` apunta
  a la cohorte de módulo que la persona **realmente cursó** — que puede
  pertenecer a **otra** especialización (EBIM 14). Su `parent_enrollment_id`
  la mantiene atada al recorrido de esa persona.

Esa separación entre **"de qué recorrido soy"** (la madre) y **"qué corrida
cursé"** (el `cohort_id` de la hija) es exactamente lo que vuelve
representables las reglas 3 y 4. Con una sola columna las dos preguntas se
pisan; con dos, cada una tiene su lugar y ninguna miente.

#### Lo que esto obtiene gratis — verificado contra el esquema

Todo lo que sigue **ya cuelga de `enrollment`**. Una inscripción hija es una
inscripción como cualquier otra, así que la maquinaria existente funciona sin
tocar ninguna tabla más:

| Regla del dueño | Qué la sostiene, hoy | Cambios de esquema |
|---|---|---|
| Asistencia por módulo (5) | `attendance.enrollment_id` → la inscripción del módulo | ninguno |
| Aprobación por módulo (5) | `assessment_result.enrollment_id` → la inscripción del módulo | ninguno |
| Un certificado por módulo (1) | `certificate.enrollment_id` es **UNIQUE** (`schema.ts:1321-1324`): una inscripción, un certificado. Con una inscripción por módulo, sale **uno por módulo** por construcción | ninguno |
| El certificado general (1) | Un `certificate` sobre la inscripción **madre**, emitido cuando todas las hijas están en `aprobado`. La unicidad garantiza que se emita una sola vez | ninguno |
| El módulo recursado que se abona (4) | `installment.enrollment_id` y `payment.enrollment_id` cuelgan de `enrollment`: la hija recursada lleva **su propio plan de cuotas**, con la maquinaria de 008 y 022 sin modificar | ninguno |
| Reprobar no bloquea (2) | No hay nada que construir: la ausencia de un mecanismo de bloqueo **es** la regla | ninguno |

Y `approvalState()` (`src/server/grading.ts:50-94`) **corre tal cual está**
sobre cada inscripción de módulo: recibe resultados, porcentaje de asistencia
y mínimo, y no sabe ni necesita saber que hay un programa arriba. El padre
**compone** (FR-016). Es el mejor indicio de que el modelo es el correcto: la
regla de negocio del dueño ya estaba soportada por el esquema, y esta fase la
hace expresable en vez de inventarle una maquinaria nueva.

#### Lo que sí hay que revisar, dicho con precisión

Sería cómodo escribir "la facturación no se toca". No es exacto, y la versión
exacta importa:

> **El esquema de facturación no cambia** —las cuotas y los pagos ya cuelgan
> de `enrollment`, y una hija es una inscripción como cualquier otra—. **Lo
> que hay que revisar es qué muestran las pantallas** cuando una inscripción
> tiene madre.

Los riesgos concretos, y son reales:

- **Contar de más.** `src/server/dashboard.ts` y cualquier total de
  inscripciones pasarían a contar 5 donde hay una venta (1 madre + 4 hijas).
- **Cobrar de más.** `src/server/billing-bulk.ts` genera planes de cuotas en
  lote sobre el roster de una cohorte. Sobre una cohorte de módulo, ese roster
  son inscripciones hijas **sin monto propio** en la venta normal: generarles
  un plan crearía deuda que nadie contrajo. La 022 lo mitiga con una decisión
  que ya está tomada —*el modo se declara, no se deduce*—, pero la regla tiene
  que quedar escrita (FR-011).
- **Ensuciar el tablero comercial.** `enrollment.stage_id` es **NOT NULL**:
  toda inscripción cae en una etapa del pipeline. Sin filtro, cada alumno de
  una especialización aparecería como cinco oportunidades de venta (FR-012).

Son **26 sitios en `src/server/` que consultan `enrollment`**. No todos
cambian, pero **todos tienen que decidir** si cuentan madres, hijas o ambas —
y esa decisión, tomada por omisión, es exactamente cómo aparece un número
inflado que nadie sabe explicar. Va enumerado en los Requirements, no
escondido.

#### El invariante que la base no protege

Hay un hecho estructural, verificado, que hace que todo esto funcione sin
retorcer nada — y que hay que declarar con su contracara:

- `assessment_result` referencia `assessment_id` y `enrollment_id`, y **no
  existe ninguna clave foránea que obligue a que `assessment.cohort_id`
  coincida con la cohorte de la inscripción**. `attendance` es igual con
  `class_session_id`.
- Esa laxitud es la que permite que la hija recursada en EBIM 14 tenga
  asistencia y notas de una cohorte que no es la de su especialización de
  origen. Es un rasgo, no un accidente.
- Y es también la que permite escribir una fila **inconsistente**. Hoy nadie
  la escribe porque todo pasa por una cohorte sola. A partir de esta fase, el
  invariante deja de ser accidental y pasa a necesitar un test (FR-031).

### 4. La dispensa de asistencia: una excepción NOMBRADA, nunca un booleano

La regla 6 del dueño abre un agujero en una regla que hasta hoy era dura.
`approvalState()` (`src/server/grading.ts:50-94`) trata la asistencia como
compuerta: por debajo del mínimo, `reprobado`, sin matices y sin apelación. El
dueño necesita poder decir "esta persona avisó antes de empezar que se iba de
viaje; en ESTE módulo la habilito igual".

La forma de esa excepción no es indiferente, y acá está la decisión de diseño:

> **La dispensa se registra sobre la inscripción del módulo con quién la
> otorgó, cuándo y por qué. Nunca es un booleano suelto.**

El motivo no es burocracia. Es el mismo criterio que este repositorio ya tomó
dos veces:

- la 024 —*un hito sólo se marca cumplido si el sistema puede probarlo*—, y
- el `sin_datos` del legajo (013), que existe precisamente para no afirmar
  algo sobre una persona cuando no hay con qué sostenerlo.

Una excepción sin autor ni motivo es **indistinguible de un error de
cálculo**. A los seis meses, frente a un alumno aprobado con 62% de
asistencia, nadie puede saber si tenía permiso o si el sistema falló — y el
único desenlace posible de esa duda es revisar a mano, o peor, desconfiar de
todos los demás estados de aprobación. Un booleano `dispensado = true` cuesta
una columna menos y destruye esa capacidad de auditar.

Cómo se comporta:

- **Es POR MÓDULO, no por especialización.** El dueño dijo "dependiendo del
  módulo": es una decisión sobre un tramo concreto, no un salvoconducto para
  los ocho meses. Vive en la inscripción hija.
- **Saltea la compuerta de asistencia, no la de notas.** Una evaluación
  obligatoria desaprobada sigue reprobando. La dispensa perdona faltas, no
  trabajos.
- **El motivo DEBE aparecer en `approvalReasons`.** El array ya existe
  (`src/server/grading.ts`) y ya se muestra en el portal
  (`src/server/student-portal.ts:173`, `516`). El alumno y el staff tienen que
  leer algo como *"asistencia por debajo del mínimo, habilitado por X el
  D/M/A"*. Una dispensa silenciosa es un número que no cierra y nadie explica.
- **El certificado sigue congelando la asistencia REAL.**
  `certificate.attendance_pct` se fija al emitir y no se recalcula (ciclo
  010). Con dispensa, el certificado va a mostrar la asistencia real **más** la
  dispensa que lo habilitó. Es lo correcto —el hecho es que faltó, y que
  alguien lo habilitó igual— y hay que cuidar de no "arreglarlo" subiendo el
  porcentaje: eso sería falsificar el dato para que la pantalla quede prolija.

Quién puede otorgarla, y si se puede revocar, quedan como **DV-003** y
**DV-004**: son las dos preguntas realmente abiertas de este mecanismo.

### 5. La colisión de vocabulario con `course_module` hay que resolverla ANTES

Ya existe una tabla llamada `courseModule` / `course_module`
(`src/lib/db/schema.ts:396-421`), y **es otra cosa**: es el **temario** de un
curso, un renglón por bloque, con sus `topics` en `jsonb`, para que el sitio
comercial dibuje el acordeón de la ficha pública. No tiene profesor, ni
fechas, ni alumnos. No es una unidad de cursada: es contenido de la página.

**Y tiene 0 filas en producción.** Nadie la usó nunca desde el ciclo 006.

Si los módulos de programa entran sin resolver esto, el repositorio queda con
**dos cosas distintas llamadas "módulo"**, una de ellas vacía y la otra en el
centro del modelo académico. El costo no lo paga quien escribe esta fase: lo
paga cada persona que en los próximos dos años lea `module` en un archivo y
tenga que averiguar de cuál de las dos se trata. Es el tipo de deuda que no
falla nunca y confunde siempre.

Las dos salidas razonables:

- **Renombrar** `course_module` a `course_syllabus_section` —o `course_topic`,
  o `temario`—, que es lo que la tabla realmente es. Cuesta un `alter table …
  rename` y tocar los pocos lugares que la nombran; conserva la funcionalidad
  por si el sitio la usa algún día.
- **Eliminarla.** Tiene 0 filas y 0 uso real. Borrar una tabla vacía es la
  operación más barata que existe, y el día que el temario estructurado haga
  falta se vuelve a crear sabiendo cómo se llama.

La decisión queda como **DV-001**, pero la obligación de resolverla **antes**
de introducir el módulo de programa es un requisito (FR-027), no una
sugerencia.

## User Scenarios

### US1 — Cada módulo con su profesor (Priority: P1)

Como coordinación quiero que cada módulo de una especialización tenga su
propio profesor, porque los ocho meses de `EBIM 13` no los dicta una sola
persona.

Hoy esto es **estructuralmente imposible**, y conviene decirlo con precisión:
`cohort.teacher_id` es **una columna**. Una cohorte tiene un titular y punto.
No hay forma de expresar "de abril a junio lo dicta A y de julio a septiembre
lo dicta B" salvo escribiéndolo en `frequency`, que es texto libre que ninguna
consulta mira.

Con el módulo como cohorte hija, cada módulo tiene su `teacher_id` y el
problema desaparece **usando la columna que ya está**.

Y hay un segundo regalo, verificado en el código: `resolveTeacherScope()`
(`src/server/teacher-portal.ts:48-81`) arma el alcance del profesor como la
unión de `cohort.teacher_id` (titular) y `class_session.teacher_id`
(suplencia). Como el módulo **es** una cohorte, el profesor del módulo entra
en el primer conjunto sin tocar una línea de esa función: **la regla de
alcance del portal del profesor no cambia**. Y la suplencia dentro de un
módulo sigue funcionando por el segundo conjunto, igual que hoy.

### US2 — El profesor ve SOLO su módulo (Priority: P1)

Como profesor del módulo 2 quiero ver mis clases, mis alumnos y mis
evaluaciones, y **no** los de los módulos 1, 3 y 4.

Esto no es una preferencia de interfaz: es la regla de aislamiento del ciclo
014. El profesor de Revit MEP no tiene por qué ver las notas que el profesor
de Revit Estructura puso en su módulo.

La buena noticia es que la regla existente ya lo produce.
`resolveTeacherScope()` devuelve **ids de cohorte**, y la cohorte del módulo 2
no es la del módulo 3: sin escribir una línea, el profesor del módulo 2
alcanza el módulo 2 y **no** alcanza a sus hermanos ni al padre.
`teacherReachesCohort()` (`src/server/teacher-portal.ts:92-123`) devuelve
`false` para la cohorte ajena y la ruta responde **404, no 403**, porque un
403 confirmaría que ese módulo existe.

Lo que hay que verificar —y por eso es un escenario y no una nota al pie— es
que **nada de lo nuevo lo rompa por comodidad**. La tentación concreta es
esta: cuando exista el armado "la especialización entera" (US3), alguien va a
querer reusarlo en el portal del profesor "para que vea el contexto". Ese día
el profesor del módulo 2 empieza a ver los alumnos y las notas de los otros
tres, y nadie se entera hasta que un profesor lo comenta.

**Escenarios**:

- El profesor del módulo 2 abre su portal → ve UNA cohorte: la suya.
- Pide por id la cohorte del módulo 3 → **404**.
- Pide por id la camada PADRE, de la que no es profesor de ningún módulo →
  **404** también. El padre no es "el contexto de todos": es una cohorte más,
  y no la alcanza.
- En su roster aparece la persona que está **recursando** ese módulo viniendo
  de otra EBIM, como una alumna más — porque para ese módulo lo es. Lo que
  **no** ve es el recorrido de esa persona en su especialización de origen.

### US3 — La especialización se ve entera (Priority: P1)

Como dueño quiero abrir la especialización y ver **los módulos en orden, las
notas de cada módulo y las tareas que hay adentro de cada uno**, sin abrir
cuatro pantallas y anotar a mano.

Es el pedido literal, y es la razón de ser de la vista de la madre. Vale para
las dos audiencias, con dos superficies distintas (Principio 3 del roadmap:
*cada audiencia con su superficie*):

- **Staff**: la camada padre muestra sus módulos ordenados por `position`,
  cada uno con su profesor, sus fechas, su avance de clases y el estado de
  aprobación de cada alumno **por módulo**.
- **Alumno**, en el portal: su cursada de la especialización muestra los
  módulos en orden, dónde está, qué aprobó, qué le falta y **qué certificados
  ya tiene**. Es la misma idea de recorrido que instaló la 024, un nivel más
  arriba.

**Escenarios**:

- Abro `Especialización en Proyectos BIM` → veo sus módulos en el orden de
  `position`, no en el orden en que se cargaron ni por fecha de inicio.
- Un módulo sin cronograma generado → se muestra igual, declarando que todavía
  no tiene clases. **No se oculta**: un módulo invisible es un módulo que
  nadie carga, y de ahí vienen los 0 `class_session` de hoy.
- Un alumno con la madre y tres hijas entra al portal → ve **una** cursada de
  especialización con sus módulos adentro, no cuatro cursadas sueltas en el
  menú.
- Un módulo que la persona cursó en **otra** camada (US4) aparece en su
  recorrido, en su `position`, diciendo en qué camada lo cursó.
- Un módulo sin evaluaciones cargadas → figura como tal, no como aprobado. El
  default optimista de `approvalState([], null, null)` es correcto en la
  planilla de cohorte y **falso** cuando se afirma algo sobre una persona: la
  distinción ya está tomada en el legajo (013) y acá se respeta.

### US4 — Recursar un módulo en una camada posterior (Priority: P1)

Como coordinación quiero que alguien que se bajó del módulo 3 —o que lo
reprobó— lo curse con la EBIM siguiente, **sin perder el recorrido que ya
tiene**.

Es el escenario que más define la fase: es el que ninguna otra forma del
modelo puede representar, y por eso es el que prueba que el modelo sirve. Los
dos caminos del dueño (reglas 3 y 4) se resuelven con el mismo mecanismo y se
distinguen sólo por la plata:

- **Baja voluntaria** (falta de tiempo, enfermedad): la inscripción hija de
  ese módulo pasa a apuntar a la cohorte del mismo módulo en la EBIM
  siguiente. La madre no se toca, el plan de cuotas del paquete no se toca:
  ya está pago.
- **Recursada tras reprobar**: se crea una **nueva** inscripción hija contra
  la cohorte del módulo en la otra EBIM, con **su propio monto y su propio
  plan de cuotas** — el pago por módulo de la regla 4. El intento anterior no
  se borra: quedó reprobado y esa es la evidencia de por qué hay que recursar.

**Escenarios**:

- Alguien de EBIM 13 se baja del módulo 3 y lo cursa con EBIM 14 → en el
  portal ve **su** especialización (EBIM 13) con los 4 módulos, y el módulo 3
  indicando que lo cursa con la camada siguiente.
- El profesor del módulo 3 de EBIM 14 ve a esa persona en su roster como una
  alumna más de su módulo. **No** ve nada de EBIM 13.
- Alguien reprueba el módulo 2, sigue cursando el 3 y el 4 con su camada
  (regla 2), y recursa el 2 con EBIM 14 abonándolo (regla 4).
- Ese pago de recursada aparece en la Caja del mes de la 026 como cualquier
  otro cobro: es plata que entró, cuelga de una inscripción y no necesita
  ninguna categoría nueva.
- La asistencia y las notas del módulo recursado se registran contra **esa**
  inscripción y no ensucian el intento anterior.

### US5 — Certificados: uno por módulo, y el general al final (Priority: P1)

Como alumno quiero el certificado de cada módulo que aprobé, aunque no termine
la especialización entera.

Es la regla 1 del dueño y **el esquema ya la soporta**:
`certificate.enrollment_id` es UNIQUE, hay una inscripción por módulo, luego
hay a lo sumo un certificado por módulo. El general es un certificado más,
sobre la inscripción **madre**, con una condición de emisión: todas las hijas
en `aprobado`.

**Escenarios**:

- Apruebo el módulo 1 → puedo recibir su certificado sin esperar ocho meses.
- Reprobé el módulo 2 y aprobé 1, 3 y 4 → tengo **tres** certificados de
  módulo y **no** tengo el general. Nadie tiene que acordarse de retenerlo:
  la condición lo impide.
- Recurso y apruebo el módulo 2 → el general pasa a ser emitible. El
  certificado del módulo 2 se emite contra la inscripción **de la recursada**,
  que es la que aprobó.
- Emitir dos veces devuelve el mismo certificado, como en el ciclo 010: la
  unicidad es la idempotencia (constitución IV).

### US6 — Habilitar a alguien que no llegó a la asistencia (Priority: P1)

Como dueño quiero poder habilitar la aprobación de un módulo concreto cuando
la persona no alcanzó el mínimo de asistencia por una razón que conozco —avisó
antes de empezar que se iba de viaje—, y que quede escrito que fui yo.

Es la regla 6, y hoy no existe: `approvalState()` trata la asistencia como
compuerta dura. La única manera de "habilitarlo" con el sistema actual sería
falsear la asistencia marcando presente a quien no vino, que es exactamente el
dato que después nadie puede desandar.

La dispensa reemplaza esa maniobra por un acto explícito, con autor, fecha y
motivo (decisión 4).

**Escenarios**:

- Alguien termina el módulo con 62% de asistencia y el mínimo es 80% → figura
  `reprobado`, con el motivo de siempre.
- Se otorga la dispensa para **ese** módulo → pasa a `aprobado`, y tanto el
  alumno como el staff leen *"asistencia por debajo del mínimo, habilitado
  por X el D/M/A"*.
- La dispensa vale para **ese módulo y nada más**: los otros tres del programa
  siguen exigiendo su asistencia.
- Alguien con dispensa **y** una evaluación obligatoria desaprobada sigue
  `reprobado`. La dispensa perdona faltas, no trabajos.
- Se emite el certificado de ese módulo → muestra la asistencia **real** que
  se congeló, más la dispensa. No un porcentaje corregido.
- Nadie puede otorgarla sin declarar el motivo: sin motivo, no hay dispensa.

### US7 — Corregir dentro del módulo (Priority: P2)

Como profesor del módulo quiero corregir las entregas de MI módulo, sin que
nadie tenga que asignármelas.

Va una decisión de diseño explícita: **no hace falta un mecanismo de
"asignarle esta corrección al profesor X"**.

El razonamiento es directo. Una evaluación pertenece a una cohorte
(`assessment.cohort_id`). El módulo es una cohorte. El profesor del módulo
alcanza su cohorte por `resolveTeacherScope()`. Por lo tanto **el profesor del
módulo ya alcanza exactamente las evaluaciones de su módulo, y ninguna otra**.
El 90% del caso sale gratis: sin tabla de ruteo, sin estado de asignación, sin
una pantalla más que mantener.

Una tabla de asignación de correcciones sería, además, una **tercera** fuente
de verdad sobre "quién puede tocar esto", conviviendo con `cohort.teacher_id`
y `class_session.teacher_id`. Tres fuentes divergen, y la que diverge es
siempre la que nadie mira.

El resto —dos profesores corrigiendo el mismo módulo, o coordinación
corrigiendo lo que el profesor no llegó a corregir— se registra como **DV-007**
y se resuelve con datos, no inventando la tabla por las dudas.

## Requirements

### La estructura del programa

- **FR-001**: `cohort` DEBE ganar `parent_cohort_id`, auto-referencia nullable
  a `cohort.id`. NULL significa "no es módulo de nada", que es el estado de
  todas las filas existentes.
- **FR-002**: `cohort` DEBE ganar `position` (entero), el orden del módulo
  dentro de su programa. El orden NO se deduce de `start_date`: dos módulos
  pueden solaparse en el calendario y el orden pedagógico lo decide la
  academia. En una cohorte sin padre, `position` no significa nada y no se
  muestra.
- **FR-003**: El anidamiento DEBE ser de **un solo nivel**: un módulo no tiene
  sub-módulos. Enunciado sobre las columnas: si `A.parent_cohort_id = B`,
  entonces `B.parent_cohort_id` DEBE ser NULL.
- **FR-004**: Una cohorte NO puede ser su propio padre.
- **FR-005**: Cómo se hacen cumplir FR-003 y FR-004, con el costo declarado:
  - La auto-referencia se expresa como
    `check (parent_cohort_id is null or parent_cohort_id <> id)` en la
    migración. **Sería el primer `check` del repositorio** —hoy hay 0 en
    `drizzle/`— y entra porque es una línea y cubre el error más tonto.
  - La profundidad **no es expresable en un `check`**: exige mirar otra fila.
    Las opciones reales son un trigger o el servidor, y se elige el
    **servidor**: la función que asigna un padre rechaza como candidata a
    cualquier cohorte que ya tenga `parent_cohort_id`, con un test unitario
    que lo fija. Un trigger sería el primero del proyecto —hoy hay 0—,
    quedaría fuera de Drizzle y de los tests de TypeScript, y nadie recordaría
    que existe hasta que rechace algo.
  - Un ciclo `A→B→A` queda impedido por FR-003 sin regla adicional: para que A
    apunte a B, B tiene que tener el padre en NULL, y entonces B no apunta a A.

### El recorrido de la persona

- **FR-006**: `enrollment` DEBE ganar `parent_enrollment_id`, auto-referencia
  nullable a `enrollment.id`. NULL = inscripción normal, que es el estado de
  las 384 filas existentes.
- **FR-007**: La inscripción **madre** apunta a la cohorte de la
  especialización y lleva el **paquete cerrado**: monto, moneda y plan de
  cuotas de la venta.
- **FR-008**: Hay una inscripción **hija** por módulo cursado. Su `cohort_id`
  apunta a la cohorte de módulo que la persona realmente cursó, **que puede
  pertenecer a otra especialización**. Esa es la regla que hace representables
  la baja voluntaria y la recursada (decisión 2, reglas 3 y 4); una hija
  restringida a los módulos de su propia madre las volvería inexpresables.
- **FR-009**: El anidamiento de inscripciones DEBE ser de **un solo nivel**, y
  una inscripción no puede ser su propia madre. Se hace cumplir igual que
  FR-005: `check` para la auto-referencia, servidor y test para la
  profundidad.
- **FR-010**: Una inscripción hija DEBE apuntar a una cohorte que tenga
  `parent_cohort_id` (es decir, a un **módulo**), y una madre a una cohorte
  **sin** padre. Colgar una hija de una cohorte suelta no significa nada y hay
  que rechazarlo con un error explícito, no dejarlo pasar.

### La plata: el esquema no cambia, las pantallas se revisan

- **FR-011**: **Ninguna tabla de cobranza se modifica.** `installment` y
  `payment` cuelgan de `enrollment` y una hija es una inscripción como
  cualquier otra: el módulo recursado que se abona (regla 4) lleva su propio
  plan con la maquinaria de 008 y 022 tal cual está.
- **FR-012**: La generación de planes **en lote** (022, `billing-bulk.ts`)
  NUNCA DEBE crear cuotas para inscripciones hijas de una venta de paquete
  cerrado. La deuda del paquete vive en la madre; generarla también en las
  hijas la duplicaría por cuatro. La 022 ya decidió que *el modo se declara,
  no se deduce*: acá esa decisión se extiende a "sobre quién".
- **FR-013**: El tablero comercial (pipeline) DEBE mostrar sólo inscripciones
  **sin madre**. `enrollment.stage_id` es NOT NULL, así que toda hija cae en
  una etapa; sin filtro, cada alumno de especialización aparecería como cinco
  oportunidades de venta. Una recursada abonada es un **cobro**, no un lead.
- **FR-014**: Todo conteo de inscripciones —dashboard, reportes, reporte por
  empresa— DEBE declarar explícitamente si cuenta madres, hijas o ambas.
  **Son 26 sitios en `src/server/` que consultan `enrollment`**: la mayoría no
  cambia, pero un total que cuenta cinco donde hubo una venta es un número que
  después nadie sabe explicar.
- **FR-015**: Las pantallas de cobranza del roster (`billing-panel`,
  `billing-bulk-panel`) y la vista de finanzas de la 026 DEBEN seguir siendo
  legibles cuando una inscripción tiene madre: se ve de qué especialización y
  de qué módulo es. **La 026 no cambia su modelo**: un pago de recursada es un
  pago como cualquier otro y entra a la Caja del mes sin categoría nueva.

### La aprobación y los certificados

- **FR-016**: `approvalState()` (`src/server/grading.ts:50-94`) se aplica
  **por inscripción de módulo, sin modificarla**. El estado de la
  especialización se **compone** sobre el de sus hijas:
  - `reprobado` si **alguna** hija está `reprobado`.
  - `pendiente` si ninguna está `reprobado` y **alguna** está `pendiente`,
    incluido el módulo que todavía no empezó.
  - `aprobado` sólo si **todas** están `aprobado`.
- **FR-017**: El invariante de la 010 se mantiene sin excepción: **un `null`
  nunca es `reprobado`**. Un alumno que va por el módulo 2 de 4 está
  `pendiente`, jamás `reprobado`. Sobre ocho meses de cursada esto pasa de
  matiz a norma: la mayor parte del tiempo, casi todo está pendiente.
- **FR-018**: Reprobar un módulo **NO bloquea** el acceso a los demás
  (regla 2). No se agrega ningún mecanismo de bloqueo, ni oculto ni
  configurable. El sistema registra; quién recursa y cuándo lo decide la
  academia.
- **FR-019**: El certificado **de módulo** se emite contra la inscripción del
  módulo. `certificate.enrollment_id` es UNIQUE, así que la unicidad y la
  idempotencia ya están garantizadas por el esquema (constitución IV).
- **FR-020**: El certificado **general** se emite contra la inscripción
  **madre**, y sólo si **todas** sus hijas están en `aprobado` (regla 1). La
  condición vive en el servidor, no en la pantalla: no se puede emitir
  llamando al endpoint directamente.
- **FR-021**: Cuando alguien recursa y aprueba, el certificado de ese módulo
  se emite contra la inscripción **de la recursada** —la que aprobó—, y el
  intento reprobado anterior se conserva. Borrarlo perdería la evidencia de
  por qué hubo una recursada.

### La dispensa de asistencia

- **FR-022**: DEBE existir una **dispensa de asistencia por inscripción de
  módulo** que habilite la aprobación pese a no alcanzar el mínimo (regla 6).
  Es por módulo, nunca por especialización. Se implementa como **columnas
  sobre `enrollment`** —autor, fecha y motivo—, siguiendo el patrón que el
  ciclo 010 ya usó para la revocación de certificados
  (`revoked_at` / `revoked_by` / `revoke_reason`): el precedente existe en el
  repositorio y evita una tabla nueva (FR-034).
- **FR-023**: La dispensa DEBE registrar **quién** la otorgó, **cuándo** y
  **por qué**. Un booleano suelto está explícitamente prohibido: sin autor ni
  motivo, una dispensa es indistinguible de un error de cálculo, y a los seis
  meses nadie puede decidir cuál de las dos cosas fue.
- **FR-024**: `approvalState()` con dispensa DEBE saltear **sólo** la
  compuerta de asistencia. Una evaluación obligatoria en `false` sigue
  reprobando, y una en `null` sigue dejando `pendiente` (FR-017). La dispensa
  perdona faltas, no trabajos.
- **FR-025**: El motivo DEBE viajar en `approvalReasons` —el array ya existe y
  ya se muestra en el portal (`src/server/student-portal.ts:173`, `516`)— con
  el autor y la fecha, legible por el alumno y por el staff. **Una dispensa
  silenciosa está prohibida**: produce un estado de aprobación que no se
  puede explicar mirando la pantalla.
- **FR-026**: El certificado DEBE seguir congelando la asistencia **REAL** en
  `certificate.attendance_pct`, como desde el ciclo 010, y mostrar la dispensa
  **junto a** ese número. Está prohibido inflar el porcentaje para que la
  emisión "cierre": el hecho es que faltó y que alguien lo habilitó igual, y
  las dos mitades tienen que quedar escritas.

### El vocabulario

- **FR-027**: La colisión con `course_module` DEBE resolverse **antes** de
  introducir el módulo de programa (renombrar o eliminar — DV-001). Terminada
  esta fase, en el repositorio DEBE haber **un solo** significado de "módulo".

### Lo que hay que enseñarle a caminar el árbol (el costo honesto)

Toda consulta que hoy asume *"una inscripción, una cohorte, un conjunto de
clases y evaluaciones"* deja de alcanzar para una especialización. No es un
detalle de implementación: es **el trabajo de la fase**, y va enumerado con
nombre y tamaño para que nadie lo descubra a mitad de camino.

- **FR-028**: `src/server/student-portal.ts` (**1339 líneas**) DEBE resolver
  la cursada de una especialización recorriendo las inscripciones hijas.
  `studentOverview`, `studentCourseDetail`, `studentNavCourses` y
  `buildMilestones` —los hitos de la 024— trabajan hoy sobre una inscripción
  y una cohorte. En particular, `studentNavCourses` DEBE mostrar **una** línea
  por especialización, no una por módulo: cinco entradas en el menú lateral
  para una sola cursada es exactamente lo que la 024 vino a evitar.
- **FR-029**: `src/server/teacher-portal.ts` (**832 líneas**) DEBE seguir
  operando **por cohorte**, sin cambios en su regla de alcance (US2). Lo único
  que puede necesitar es saber que su cohorte tiene padre, para nombrarla bien
  en pantalla ("Módulo 2 — Especialización en Proyectos BIM"). **Nada más.**
  Cualquier cosa que le agregue visibilidad al profesor está fuera de alcance.
- **FR-030**: `src/server/grading.ts` (**554 líneas**),
  `src/server/classes.ts` (**390 líneas**), `src/server/attendance.ts` y
  `src/server/certificates.ts` DEBEN operar por módulo, y componer sólo donde
  FR-016 y FR-020 lo piden. La planilla por cohorte sigue siendo por cohorte:
  un módulo se corrige con la misma pantalla que cualquier otra cohorte.
  Los horarios se siguen componiendo en un solo lugar, `classInstant()` de
  `src/lib/schedule-time.ts`: esta fase no arma ninguna fecha de clase por su
  cuenta.
- **FR-031**: `src/server/student-record.ts` (**355 líneas**) —el legajo del
  staff— DEBE mostrar la especialización con sus módulos, incluidos los
  cursados en otra camada. El legajo **no reusa** `student-portal.ts` ni al
  revés: la separación es deliberada (el legajo lleva cédula, teléfono y un
  estado de cuenta gateado por una capacidad de staff) y hay un test que la
  sostiene. Se paga el recorrido dos veces, a propósito.

### Sin regresión

- **FR-032**: Una inscripción **sin madre y sin hijas**, a una cohorte **sin
  padre y sin hijas**, DEBE comportarse **exactamente** como hoy: mismas
  pantallas, mismos endpoints, mismos cálculos, mismos textos. Es un requisito
  duro, no una aspiración: **33 de las 41 cohortes son simples** y son la
  operación cotidiana de la academia.
- **FR-033**: Los caminos nuevos DEBEN activarse por la presencia de
  `parent_cohort_id` / `parent_enrollment_id`, no por una bandera de
  configuración ni por una heurística sobre el nombre del curso. La condición
  es un dato, y un dato ausente devuelve el comportamiento anterior sin
  ninguna rama que alguien pueda encender por error.

### Restricciones

- **FR-034**: **Esta fase no agrega ninguna tabla.** Por lo tanto no hay
  `enable row level security` ni política `tenant_isolation` que escribir a
  mano en la migración. Queda dicho explícitamente porque la regla es real y
  muerde: `db:generate` **no** genera las políticas y
  `tests/unit/rls-cobertura.test.ts` falla cuando alguien agrega una tabla de
  dominio y se olvida. Acá no hay nada que escribir — el aislamiento de
  `cohort` y de `enrollment` ya existe y las columnas nuevas —dos en `cohort`,
  una de recorrido y tres de dispensa en `enrollment`— viven adentro de él.
  Si la dispensa terminara siendo una tabla en vez de columnas (FR-022), esta
  exención **deja de valer** y la migración tiene que escribir a mano
  `enable row level security` y `tenant_isolation`.
- **FR-035**: La migración DEBE ser **re-ejecutable** (Principio IV),
  siguiendo el patrón de `drizzle/0036`: columnas con `if not exists` y los
  `check` agregados sólo si faltan. Correrla dos veces no puede fallar ni
  pisar datos.
- **FR-036**: **Sin dependencias de runtime nuevas.** El proyecto tiene 15 por
  decisión y el Principio II no se toca ni se enmienda. Esta fase es esquema y
  consultas: no hay nada que instalar.

### Verificación

- **FR-037**: DEBE haber un test que verifique que un `assessment_result` y
  una `attendance` de un módulo, contra la inscripción **hija** de ese módulo,
  se leen correctamente en la cursada del alumno, **incluso cuando la cohorte
  del módulo pertenece a otra especialización**. Es el invariante que la
  decisión 3 apoya en la **ausencia** de una clave foránea: lo que la base no
  impide, lo fija un test.
- **FR-038**: DEBE haber un test del certificado general: no se emite con una
  hija en `pendiente` ni con una en `reprobado`, y se emite —una sola vez— con
  todas en `aprobado` (FR-020).
- **FR-039**: DEBE haber un test de la dispensa sobre `approvalState()`: con
  asistencia por debajo del mínimo y dispensa vigente el estado es `aprobado`
  y el motivo aparece en `approvalReasons` con autor y fecha; **con una
  evaluación obligatoria en `false` sigue siendo `reprobado`** pese a la
  dispensa (FR-024); y sin dispensa el resultado es idéntico al de hoy.
- **FR-040**: DEBE haber un test de FR-003, FR-004 y FR-009: no hay dos
  niveles en ninguna de las dos jerarquías, nadie es su propio padre, y el
  intento de armar un ciclo se rechaza.
- **FR-041**: DEBE haber un test de FR-032 sobre una inscripción simple:
  mismos resultados antes y después del cambio.

## Decisiones a verificar

Las preguntas sobre certificados, bloqueo por reprobación y aprobación por
módulo **ya no están acá**: las contestó el dueño el 2026-09-07 y viven en la
decisión 2. Lo que queda abierto es esto:

- **DV-001**: qué se hace con `course_module` — **renombrar** a
  `course_syllabus_section` o **eliminar**. *(propuesta: eliminar. 0 filas, 0
  uso desde el ciclo 006, y recrearla el día que el temario estructurado haga
  falta cuesta menos que arrastrar una tabla vacía con el nombre equivocado.
  Si el sitio comercial la tiene prevista, se renombra.)*
- **DV-002**: la asistencia se exige por módulo (regla 5), pero **¿de dónde
  sale el número?** Hoy `min_attendance_pct` vive en `course` y la cohorte lo
  pisa. Las dos opciones: el módulo **hereda** el del curso de la
  especialización, o **cada módulo declara el suyo**. *(propuesta: cada módulo
  declara el suyo, con la herencia del curso de la especialización como
  default. Un módulo de dos clases y uno de veinte no toleran el mismo umbral,
  y la cadena `cohort → course` ya existe desde el ciclo 009: no hay que
  inventar nada, sólo decidir qué curso es el que se hereda cuando el módulo
  se cursa en otra camada.)* Con dispensas por módulo (decisión 4) esto pesa
  más: el umbral y su excepción tienen que hablar del mismo módulo.
- **DV-003**: **¿qué capacidad gobierna la dispensa de asistencia?**
  *(propuesta: `evaluacion.editar`. Es una decisión de aprobación —lo que
  cambia es si el alumno aprueba—, no de asistencia: `asistencia.editar` la
  tiene el profesor que pasa lista, y habilitar a alguien pese a sus faltas es
  una decisión de la academia, no de quien registró las ausencias.)*
  **Advertencia deliberada**: si el dueño quiere una capacidad más angosta,
  eso es una **capacidad 18** en la lista cerrada de `src/lib/capabilities.ts`.
  Por el mecanismo de la 027, agregarla **obliga a describirla** en
  `src/lib/guia.ts` o `pnpm typecheck` falla y `pnpm build` no sale. Esa
  consecuencia es **deseable**, no un obstáculo: significa que ninguna
  capacidad puede existir sin que la guía diga qué es y dónde se usa. Se
  menciona acá para que la decisión se tome sabiendo lo que arrastra, no para
  desalentarla.
- **DV-004**: **¿la dispensa se puede revocar?** *(propuesta: sí, con el mismo
  patrón que el ciclo 010 le dio al certificado —`revoked_at`, `revoked_by`,
  `revoke_reason`—: se marca revocada, **no se borra**. Borrarla dejaría un
  alumno que aprobó sin que ningún registro explique por qué; y si además ya
  se le emitió el certificado, hay que decidir si la revocación de la dispensa
  arrastra la revocación del certificado —que el 010 ya sabe hacer— o son dos
  actos separados. La propuesta es que sean dos actos separados y explícitos:
  encadenarlos automáticamente revoca un certificado ya entregado en la mano
  de una persona, sin que nadie lo haya decidido.)*
- **DV-005**: ¿puede existir una inscripción **madre sin hijas** todavía
  creadas? *(propuesta: sí. Se inscribe y se paga el paquete antes de que la
  academia arme el detalle de los módulos, y prohibirlo obligaría a crear
  cuatro filas en el momento de la venta, cuando quizás no están todas las
  cohortes de módulo definidas. Consecuencia que hay que aceptar y mostrar
  bien: una madre sin hijas está `pendiente`, nunca `aprobado` — el default
  optimista de `approvalState([], null, null)` NO puede aplicarse acá.)*
- **DV-006**: al recursar en otra EBIM, ¿la persona **ocupa cupo** de esa
  camada? `cohort.capacity` existe desde el ciclo 005. *(propuesta: sí, ocupa.
  Un asiento en el aula es un asiento, lo pague quien lo pague. Si el dueño
  prefiere que los recursantes entren por encima del cupo, hay que decirlo
  explícitamente porque cambia el conteo.)*
- **DV-007**: ¿hace falta algún mecanismo de asignación de correcciones más
  allá del profesor del módulo (US7)? *(propuesta: no, hasta que aparezca un
  caso real. Se mide después de la primera especialización cargada entera.)*
- **DV-008**: ¿los módulos aparecen en el catálogo público, o sólo la
  especialización? *(propuesta: sólo la especialización. El catálogo lee
  `course` y no `cohort`: con los módulos como cohortes hijas esto se cumple
  solo. El pago por módulo de la regla 4 no cambia esto — no es una compra de
  catálogo, es una recursada que arma coordinación.)*
- **DV-009**: ¿la camada padre tiene clases propias, o sólo las tienen sus
  módulos? *(propuesta: sólo los módulos. Una clase colgada del padre no
  pertenece a ningún módulo y rompe la pregunta "¿de qué módulo es esta
  clase?", que es justamente la que la fase viene a contestar. La clase
  inaugural del programa se carga como clase del módulo 1.)*

## Definición de Hecho

El gate técnico (`pnpm typecheck && pnpm lint && pnpm build && pnpm test`) es
el piso. El Principio IX de la constitución —**Verificación de Comportamiento
en Vivo, NO NEGOCIABLE**— pide ejercer el comportamiento como lo haría un
usuario real, y en esta fase pesa más que en las anteriores: el modelo es
correcto o incorrecto **al recorrerlo**, y ningún test unitario sobre tres
columnas prueba que una persona que recursó el módulo 3 con la camada
siguiente ve su recorrido entero.

- **DoD-1**: la 028 DEBE agregar su bloque `== 028: especializaciones y
  módulos ==` a `scripts/e2e-selftest.mjs`: crear una especialización con sus
  módulos, un profesor distinto por módulo, inscribir a alguien con
  **inscripción madre + hijas**, cargar clases y evaluaciones en las hijas, y
  verificar que el alumno ve **una** cursada con sus módulos adentro.
- **DoD-2**: la recursada, ejercida de punta a punta: una segunda camada, una
  hija que apunta a un módulo de esa otra camada con su propio plan de cuotas,
  un pago, y el recorrido de la persona mostrando el módulo cursado en la
  camada siguiente.
- **DoD-3**: los certificados: se emite el de un módulo aprobado, **no** se
  emite el general con una hija pendiente ni con una reprobada, y **sí** se
  emite —una sola vez— cuando todas aprobaron.
- **DoD-4**: el camino infeliz: el profesor del módulo 2 pide la cohorte del
  módulo 3 y recibe **404**; se intenta colgar una hija de otra hija (cohorte
  e inscripción) y se rechaza; se intenta colgar una inscripción hija de una
  cohorte sin padre y se rechaza (FR-010).
- **DoD-5**: la dispensa de asistencia, ejercida en vivo: alguien por debajo
  del mínimo queda `reprobado`; se otorga la dispensa con autor y motivo;
  pasa a `aprobado` y el motivo **aparece en la pantalla del alumno** con
  quién lo habilitó y cuándo. Y el contraejemplo: con una evaluación
  obligatoria desaprobada, la dispensa **no** lo salva.
- **DoD-6**: una inscripción simple a una cohorte simple, ejercida en el mismo
  bloque y dando **lo mismo que antes** (FR-032).
- **DoD-7**: queda anotada la deuda del arnés, que esta fase hereda y no
  inventa: `scripts/e2e-selftest.mjs` tiene bloques rotulados **hasta la
  020**, y los de la **022**, la **026** y la **027** están **escritos pero
  todavía no corridos**. Un bloque nuevo que se suma a tres sin ejecutar no es
  verificación: es texto. La 028 no se declara Hecha con el arnés en rojo o
  sin correr.

## Success Criteria

- **SC-001**: La especialización real `Especialización en Proyectos BIM` se
  carga con sus **4 módulos**, en orden, y **4 profesores distintos**, uno por
  módulo. Verificado en vivo, sobre datos reales.
- **SC-002**: El profesor del módulo 2 entra a su portal y ve **una** cohorte
  —la suya—; pedir por id la de otro módulo, o la de la camada padre, devuelve
  **404**, no 403.
- **SC-003**: Un alumno con inscripción madre y 4 hijas abre su portal y ve
  **una** cursada de especialización con los **4 módulos en orden**, cada uno
  con sus evaluaciones y su estado — no cuatro cursadas sueltas en el menú.
- **SC-004**: Alguien que se bajó del módulo 3 y lo cursa con la camada
  siguiente ve su recorrido **completo**, con el módulo 3 indicando en qué
  camada lo cursa; y el profesor de ese módulo en la otra camada lo ve en su
  roster **sin** ver nada de la especialización de origen.
- **SC-005**: Alguien que reprobó un módulo tiene los certificados de los
  módulos que aprobó y **no** tiene el general; después de recursar y aprobar,
  el general pasa a ser emitible. Verificado por test (FR-038) y en vivo.
- **SC-006**: El pago de una recursada aparece en la Caja del mes de la 026
  como cualquier otro cobro, en su moneda, **sin ninguna categoría nueva** y
  sin tocar la pantalla de finanzas.
- **SC-007**: Un alumno de especialización cuenta como **una** inscripción en
  el dashboard y como **una** oportunidad en el tablero comercial, no como
  cinco (FR-013, FR-014).
- **SC-008**: Una camada `EBIM` deja de tener **0 clases**: se genera el
  cronograma de al menos un módulo y sus clases aparecen en el calendario
  atribuidas a ese módulo. Es la métrica que dice si la fase sirvió — hoy ese
  número es cero para las 9 cohortes de programa.
- **SC-009**: Las **33 cohortes simples** y sus inscripciones se comportan
  **idénticamente** antes y después: mismo estado de aprobación, mismo
  porcentaje de asistencia, mismo legajo, mismo estado de cuenta, mismas
  pantallas. Verificado por test (FR-041) y ejercido en el arnés (DoD-6).
- **SC-010**: Un alumno que va por el módulo 2 de 4 nunca figura `reprobado`
  por los módulos que no empezó (FR-017), y las razones nombran el módulo que
  las causó.
- **SC-011**: Un alumno aprobado con la asistencia por debajo del mínimo
  muestra, **en su propia pantalla**, quién lo habilitó y por qué. No existe
  ningún camino por el que una aprobación con asistencia insuficiente aparezca
  sin explicación: si el motivo no está, es un error de cálculo y hay que
  tratarlo como tal.
- **SC-012**: El certificado de un módulo aprobado con dispensa muestra la
  asistencia **real** congelada más la dispensa que lo habilitó, y no un
  porcentaje corregido (FR-026).
- **SC-013**: En todo el repositorio, "módulo" significa **una sola** cosa
  (FR-027).
- **SC-014**: `scripts/e2e-selftest.mjs` corre verde con bloque propio para la
  028, y con los de la 022, la 026 y la 027 efectivamente ejecutados.

## Out of Scope

- **Vender módulos sueltos en el catálogo.** El pago por módulo existe
  **únicamente** como recursada de alguien que ya cursó la especialización
  (regla 4): lo arma coordinación sobre una inscripción hija, no lo compra un
  desconocido desde la web. La venta normal sigue siendo el **paquete
  cerrado**. Abrir el módulo como producto de catálogo es otra fase y otra
  discusión comercial.
- **Notas numéricas y devolución escrita.** Es la
  [016](../016-entregas/spec.md), que esta fase **habilita**: los módulos le
  dan a la 016 el lugar donde la entrega y la corrección tienen dueño —el
  profesor del módulo— y donde la entrega tiene una inscripción concreta
  contra la cual registrarse. Hasta que la 016 diga otra cosa, la escala sigue
  siendo APROBADO / NO APROBADO.
- **Anidar más de un nivel**, ni en cohortes ni en inscripciones. Un programa
  de programas no existe en la academia y el modelo lo prohíbe a propósito
  (FR-003, FR-009). Permitirlo "por si acaso" obliga a que toda consulta sea
  recursiva desde el primer día, para un caso que nadie pidió.
- **Migrar automáticamente los cursos cuyo nombre codifica módulos.**
  `"Revit Arq + Revit Estructura + Revit MEP"` no se parte con un script.
  Decidir si eso es un curso de tres módulos o tres cursos que se venden
  juntos, qué fechas tiene cada parte y quién dicta cada una es **una decisión
  humana, de a un curso por vez**. Un script que parta por `+` inventaría
  estructura sobre 7 cursos con 100 inscripciones adentro, y desarmarlo
  costaría más que hacerlo a mano.
- **Un régimen general de excepciones académicas.** La dispensa de esta fase
  es **sólo de asistencia** (regla 6). No se inventa un mecanismo para
  perdonar una evaluación desaprobada, prorrogar una entrega o justificar una
  falta a posteriori: cada una de esas cosas es una decisión distinta, con
  otro riesgo, y meterlas bajo la misma columna las vuelve indistinguibles.
- **Correlatividades y prerrequisitos** entre módulos. La regla 2 del dueño es
  explícita —reprobar no bloquea—; un motor de correlativas es otro dominio y
  contradiría la decisión.
- **Reprogramar automáticamente a quien se dio de baja.** Que la persona pase
  al mismo módulo de la camada siguiente es una **decisión de coordinación**
  que el sistema registra; elegir la camada por ella exigiría saber cupos,
  fechas y disponibilidad, y ninguna de las tres cosas la sabe el CRM.
- **Cambiar el catálogo público.** Los módulos son cohortes, y el catálogo lee
  `course`: no se entera (DV-008).
- **Reescribir el portal del profesor.** La regla de alcance del 014 se
  conserva tal cual. Esta fase se apoya en ella y no la negocia.
