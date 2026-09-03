# Research — 014 Portal del profesor

**Creado**: 2026-08-27 · Depende de [012](../012-identidad-y-permisos/spec.md)
y [013](../013-legajo-y-cursada/spec.md), ambas implementadas.

## Medido contra la base real ANTES de decidir nada

| Qué | Cuánto | Por qué importa |
|---|---|---|
| Profesores | 7 | La audiencia entera de esta fase |
| **Profesores con correo cargado** | **0 de 7** | **Bloquea la fase**: la invitación de 012 exige correo |
| `account_link` de tipo profesor | 0 | Nadie tiene acceso todavía |
| Cohortes con profesor asignado | 33 de 41 | |
| **Cohortes SIN profesor** | **8** | No las va a ver nadie desde el portal |
| Clases con profesor propio (suplencia) | 0 | `class_session.teacher_id` existe y está vacío |

Reparto de cohortes por profesor:

| Profesor | Cohortes |
|---|---|
| Ovidio Santos | **18** |
| Claudio Fortunato | 4 |
| Sandra Moros | 3 |
| Ximena Pereira | 3 |
| Nicolas Villarreal | 2 |
| Andres Del Castillo | 2 |
| Fernan Luna | 1 |

### Las dos consecuencias que cambian la fase

**1. Nadie puede entrar todavía.** `teacher.email` está vacío en los 7. La
invitación de 012 (`grantPortalAccess`) responde "no tiene correo cargado" y
no hay forma de sortearlo — ni debería haberla, porque el correo ES la
identidad con la que entra. La fase se puede construir entera, pero hasta que
alguien cargue esos 7 correos no la usa nadie. **No es un bloqueo de
desarrollo; es un paso operativo que hay que decir en voz alta.**

**2. `grantPortalAccess` hoy solo sabe de alumnos.** Está escrita con
`kind: "alumno"` fijo y sale de una inscripción. `createAccountLink` sí acepta
`kind: "profesor"`, y `validateAccountLink` ya contempla que un profesor NO
necesita inscripción. Falta el camino de invitación: una ruta y un botón en la
ficha del profesor.

**Lo que NO falta**: `class_session.teacher_id` ya existe (ciclo 009), así que
la suplencia de FR-001 no necesita modelo nuevo. Está vacío porque tampoco hay
cronogramas generados.

---

## DV-001 — ¿Puede corregir asistencia de una clase pasada?

**Propuesta**: sí, con registro de quién y cuándo.

**Resolución**: ADOPTADA. El motivo está en la spec y es la realidad del
negocio: *el cuaderno se transcribe tarde*. Prohibirlo no hace que el dato
llegue a tiempo — hace que no llegue nunca, o que se lo pidan a coordinación,
que es exactamente lo que esta fase viene a evitar.

`attendance` ya guarda `recordedBy` y `updatedAt`, así que el registro no
cuesta modelo nuevo.

---

## DV-002 — ¿Puede crear evaluaciones o solo cargar resultados?

**Resolución**: **solo cargar resultados** (FR-006). Crear y borrar
evaluaciones queda en coordinación.

**Por qué**: una evaluación define si alguien se recibe. Si cada profesor
puede agregar o quitar las suyas, dos cohortes del mismo curso dejan de ser
comparables y el certificado pierde sentido. Cargar el resultado de una
evaluación que ya existe es su trabajo; definir qué se evalúa es del diseño
del curso.

Se traduce en capacidades: el profesor tendrá `evaluacion.editar` (cargar
resultados) pero NO `academico.editar` (definir evaluaciones). La separación
ya existe en 012 y no hay que inventar nada.

---

## DV-003 — ¿Ve la asistencia acumulada del alumno o solo la de sus clases?

**Resolución**: **la acumulada de SU cohorte**, no la del alumno en la
academia.

**Por qué**: el profesor necesita saber si el alumno va a llegar al mínimo
para aprobar SU curso — es la conversación que tiene que tener con él antes de
que sea tarde. Lo que ese alumno hizo en otro curso, con otro profesor, no es
asunto suyo.

Es la misma línea que FR-003: el portal muestra lo de su cohorte, no el legajo
completo de la persona.

---

## DV-004 — ¿Ve el correo y el teléfono de sus alumnos?

**Resolución**: **NO**. Solo el nombre.

**Por qué**: FR-003 ya lo dice para los datos comerciales, y el criterio es el
mismo. Son 340 personas que le dieron su teléfono a la academia, no a cada
profesor que pase por su cohorte. El profesor que necesite contactar a un
alumno tiene a coordinación, que es quien tiene esa relación.

**Cuando llegue el 017** (chat) va a poder escribirle DENTRO de la plataforma,
que es mejor para todos: queda registro y nadie entrega un teléfono.

---

## DV-005 — ¿Qué pasa cuando termina la cohorte?

**Propuesta**: sigue viéndola, en solo lectura.

**Resolución**: ADOPTADA, con una precisión. Sigue viéndola **completa** —le
sirve para reusar material y para responder "¿este alumno aprobó conmigo?"—
pero **no puede editar** asistencia ni resultados de una cohorte finalizada.

**Por qué la precisión**: una cohorte cerrada ya emitió certificados. Cambiar
una nota después de eso no es corregir un error, es alterar un documento
entregado. Si de verdad hay que corregirlo, que pase por coordinación, que
tiene la capacidad y el contexto.

`cohort.status` ya distingue `finalizada`, así que la regla es leíble sin
modelo nuevo.

---

## DV-006 — ¿Cómo se invita a un profesor? *(NUEVA, la abre la medición)*

**Contexto**: `grantPortalAccess` está escrita solo para alumnos y sale de una
inscripción. Un profesor no tiene inscripción.

**Propuesta**: una ruta `POST /api/teachers/[id]/access` con capacidad
`accesos.gestionar`, que reuse la maquinaria de 012 (cuenta con contraseña
temporal + correo) cambiando únicamente el `kind` y de dónde sale el correo
(`teacher.email` en vez de `contact.email`). **Sin envío masivo**, igual que
T017b: de a uno y explícito.

**Resolución**: ADOPTADA (2026-08-27, dueño). `POST /api/teachers/[id]/access`
con `accesos.gestionar`, reusando la maquinaria de 012. Sin envío masivo.

---

## DV-007 — ¿Quién carga los 7 correos? *(NUEVA, la abre la medición)*

**Resolución**: **A — los carga el dueño a mano** (2026-08-27). El campo ya
existe en `teacher-form.tsx`, son 7 registros, y una migración con correos
personales incrustados queda versionada en git para siempre — justo lo que se
evitó con la contraseña de `cadit_app`.

---

## DV-008 — Alta y baja de alumnos y profesores *(NUEVA, pedido del dueño)*

**Contexto medido**: crear ya existe para los dos (`POST /api/teachers`,
`POST /api/contacts`). **Eliminar no existe para ninguno.** Y al ir a
agregarlo apareció el problema:

```
contact → enrollment → certificate · payment · installment
                     → attendance · assessment_result · license   (todo CASCADE)
```

Borrar un alumno hoy destruiría su historial académico y financiero completo,
**incluidos los certificados emitidos**, sin aviso y sin vuelta atrás.

Borrar un profesor es más benigno (`cohort.teacher_id` y
`class_session.teacher_id` son `SET NULL`), pero borrar a Ovidio Santos deja
**18 cohortes sin docente** de un click.

**Resolución** (2026-08-27, dueño):

- **Alumnos — bloquear y ofrecer archivar.** Sin ninguna inscripción se borra
  de verdad (es un lead que nunca cursó, o un error de carga). **Con
  historial NO se borra: se archiva** — sale de las listas y del portal, pero
  notas, pagos y certificados quedan intactos, y se puede desarchivar.
  *Por qué*: un certificado emitido es un documento. Borrarlo no corrige un
  error, borra la prueba de que alguien se recibió.
  Requiere `contact.archived_at`.
- **Profesores — exigir reasignar primero.** No se puede dar de baja a un
  profesor con cohortes: primero se reasignan a otro docente. *Por qué*: 18
  cohortes huérfanas por un click son 18 pantallas que dejan de tener sentido,
  y el error se descubre semanas después. Un paso más al dar de baja a alguien
  que ya no está es barato; reconstruir quién dictaba qué, no.

---

## DV-009 — Las evaluaciones y las cohortes en curso *(pregunta del dueño)*

**La pregunta**: si una cohorte próxima a empezar cambia sus evaluaciones,
¿afecta a una que ya está en curso?

**Respuesta: no, y por diseño.** `assessment.cohort_id` — las evaluaciones
cuelgan de la COHORTE, no del curso. Dos cohortes del mismo curso tienen filas
distintas, así que cambiar las de una no puede tocar las de la otra. Ya estaba
resuelto desde el ciclo 010; no hace falta nada.

**Pero la medición muestra la consecuencia incómoda**: hay **0 evaluaciones
cargadas** en las 41 cohortes. Como cada una define las suyas desde cero y el
profesor no puede crearlas (DV-002), su pantalla de "cargar resultados"
nacería **vacía en todas** — el mismo problema que tuvo el calendario en la
013 con `class_session` vacía.

**Resolución**: la fase incluye una acción **"copiar evaluaciones de otra
cohorte"** en el panel de coordinación. Se define una vez por curso y se reusa
al abrir cada cohorte nueva. Copiar y no heredar es deliberado: heredar del
curso haría que cambiar el curso alterara cohortes en marcha, que es
exactamente lo que el dueño quiere evitar.
