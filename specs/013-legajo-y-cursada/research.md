# Research — 013 Legajo académico y contenido de cursada

**Creado**: 2026-08-27 · Depende de [012](../012-identidad-y-permisos/spec.md),
implementada.

## Medido contra la base real ANTES de decidir nada

| Qué | Cuánto | Por qué importa |
|---|---|---|
| Cohortes | 41 | |
| **`class_session` (clases reales)** | **0** | FR-004 manda construir el calendario sobre esta tabla. **Está vacía.** |
| **Cohortes con cronograma generado** | **0 de 41** | |
| Cursos | 34 | |
| **`course_module` (temario)** | **0** | DV-002 pregunta si el material se cuelga del temario. **No hay temario.** |
| Cohortes sin horario cargado | 6 de 41 | `start_time`/`end_time` vacíos |
| Formato de horario | texto `"09:00"` | sin zona horaria (FR-010b) |

`generateSchedule()` ya existe en `src/server/attendance.ts` (ciclo 009): la
capacidad de generar el cronograma está construida, **nunca se usó**.

El calendario actual (`calendar-client.tsx`) lee `/api/cohorts` y dibuja los
días de la semana declarados — exactamente lo que FR-004 quiere reemplazar.

### La consecuencia que cambia la fase

FR-005 previó "una cohorte sin cronograma se muestra por sus días declarados,
con marca de proyección". Se leía como un caso borde. **Es el 100% de las
cohortes.**

Si se implementa FR-004 tal cual —calendario sobre `class_session`— el
resultado es un **calendario vacío para las 41 cohortes**. Peor que hoy.

Por eso la fase tiene que resolver primero *cómo llegan a existir las clases*,
y esa pregunta no estaba en la spec. Se abre como **DV-006**.

---

## DV-001 — ¿Cuántos minutos antes aparece el enlace de la reunión?

**Propuesta**: 15 minutos antes, hasta 30 después del fin.

**Resolución**: ADOPTADA. Se guarda como configuración de la organización, no
como constante en el código (FR-003 dice "configurable"). Con clases de 2
horas, 15 minutos es holgado para el que llega temprano y corto para que el
enlace quede colgado todo el día.

---

## DV-001b — ¿La grabación caduca?

**Propuesta**: mientras el alumno conserve acceso al legajo.

**Resolución**: ADOPTADA, y ya estaba decidida: la **DV-005 de 012** resolvió
que el acceso NO caduca ("el legajo, el certificado y las grabaciones son lo
que un egresado vuelve a buscar"). La grabación sigue esa regla. Sin lógica de
expiración: código que no se escribe no se rompe.

---

## DV-001c — ¿Quién carga la grabación?

**Propuesta**: profesor y coordinación.

**Resolución**: ADOPTADA, resuelta con capacidades y no con roles: exige
`asistencia.editar`, que es la capacidad que ya tiene quien opera una clase.
Cuando llegue el portal del profesor (014), tendrá esa capacidad para SUS
cohortes y funcionará sin tocar esto.

---

## DV-002 — ¿El material cuelga de `course_module` o es independiente?

**Propuesta**: independiente, con referencia opcional al módulo.

**Resolución**: ADOPTADA, y la medición la refuerza: **`course_module` tiene 0
filas**. Atar el material a un temario que nadie cargó lo dejaría inutilizable
desde el día uno. La referencia al módulo queda opcional para cuando el
temario exista.

---

## DV-003 — ¿Los anuncios notifican?

**Propuesta**: en esta fase solo se registran y se ven.

**Resolución**: ADOPTADA. Notificar es 017. Un anuncio que se guarda y se ve ya
resuelve el problema declarado ("que «no me enteré» deje de ser una
discusión"): queda registrado con autor y fecha.

---

## DV-004 — ¿El legajo es por `contact` o por `enrollment`?

**Propuesta**: por contacto, con sus inscripciones adentro.

**Resolución**: ADOPTADA. Es la pregunta que hace el coordinador ("contame de
Ana"), no "contame de la inscripción 47". Además es coherente con 012: el
acceso al portal se otorga al CONTACTO, no a la inscripción, justamente porque
la misma persona puede cursar tres veces con una sola cuenta.

---

## DV-005 — ¿Dónde vive la zona horaria?

**Propuesta**: en la organización; el portal convierte a la del navegador.

**Resolución**: ADOPTADA. CAD IT dicta desde Montevideo: una zona por academia
alcanza. Ponerla en la cohorte sería modelar una flexibilidad que nadie pidió
y que habría que llenar 41 veces.

**Alcance real del problema** (medido en 012): 42 alumnos en Paraguay y 45 en
otros países. No es hipotético.

**Cómo**: `organization.timezone` (IANA, default `America/Montevideo`). Los
horarios siguen siendo texto `"09:00"` —cambiarlos a `time` es una migración
sobre 41 cohortes que no compra nada— pero se INTERPRETAN en esa zona al
componer la fecha real de cada clase.

---

## DV-006 — ¿Cómo llegan a existir las clases? *(NUEVA, la abre la medición)*

**Contexto**: `class_session` está vacía y las 41 cohortes existen. FR-004
manda calendario sobre `class_session`; aplicarlo hoy da un calendario vacío.

**Opciones**:

- **A. Generar el cronograma de las 41 cohortes en una migración.** El
  calendario funciona el día uno. Contra: escribe ~cientos de filas sobre datos
  reales a partir de horarios que 6 cohortes no tienen, y muchas cohortes ya
  terminaron — se generarían clases pasadas que nadie dictó como tales.
- **B. Acción explícita "generar cronograma" por cohorte, desde el panel.**
  Coordinación decide cuáles. Contra: las 41 quedan sin calendario hasta que
  alguien apriete, cohorte por cohorte.
- **C. El calendario mezcla: clases reales donde existen, proyección donde no,
  con la marca de FR-005.** Nada que generar. Contra: la proyección no puede
  cancelarse ni llevar enlace de grabación — es un dibujo, no un cronograma.

**Propuesta**: **B + C**. El calendario mezcla desde el principio (nadie se
queda sin nada) y generar el cronograma es una acción explícita por cohorte,
que es la que convierte el dibujo en clases de verdad. Descarta A porque
escribir cientos de clases pasadas sobre datos reales, a partir de horarios
incompletos, es exactamente el tipo de migración que después nadie sabe
deshacer.

**Resolución**: RESUELTA — **B + C** (2026-08-27, dueño). El calendario mezcla
clases reales y proyección desde el primer día, y generar el cronograma es una
acción explícita por cohorte. Se descarta A: escribir cientos de clases pasadas
sobre datos reales, con horarios incompletos, es una migración que después
nadie sabe deshacer.

**Consecuencias de diseño**:

- El calendario devuelve las dos cosas con una marca (`projected: true/false`).
  Una proyección NO se puede cancelar, no lleva enlace de grabación y no
  registra asistencia: es un dibujo hasta que alguien genere el cronograma.
- La acción reusa `generateSchedule()` del ciclo 009, que ya existe y nunca se
  usó. No se escribe lógica nueva de generación.
- Las 6 cohortes sin horario cargado no pueden generar cronograma. La pantalla
  lo dice con ese motivo —mismo criterio que T017d de 012— en vez de ofrecer
  un botón que falla.
