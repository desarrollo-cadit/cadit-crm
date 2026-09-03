# Plan — 014 Portal del profesor

Asume [research.md](research.md) (9 DV resueltas) y
[data-model.md](data-model.md).

## Constitution Check

| Principio | Cómo lo cumple |
|---|---|
| **I — Seguridad** | El portal no expone datos comerciales ni de contacto (FR-003/DV-004). No se filtran en la UI: **no se arman en el DTO**. |
| **II — Soberanía** | Cero dependencias nuevas. Reusa Better Auth y el correo M365 que ya se usan para invitar alumnos. |
| **III — Multi-tenancy** | Todo pasa por `scoped()` + RLS. `contact.archived_at` va sobre una tabla ya protegida. |
| **IV — Idempotencia** | Copiar evaluaciones sobre una cohorte que ya las tiene no duplica. Invitar dos veces reusa la cuenta. |

**Sin enmienda constitucional.**

## Lo que esta fase NO puede olvidar

Dos cosas medidas que, si no se resuelven, hacen que el portal nazca vacío:

1. **0 de 7 profesores tienen correo.** Los carga el dueño (DV-007), pero la
   fase tiene que decirlo en pantalla: sin correo no hay invitación posible, y
   el botón debe explicar por qué en vez de fallar (criterio T017d de 012).
2. **0 evaluaciones cargadas en 41 cohortes.** Sin la copia de evaluaciones,
   la pantalla de "cargar resultados" del profesor está vacía en todas. Es el
   mismo error que casi cometemos en la 013 con el calendario.

## Orden, y por qué es ese

### Paso 1 — Que la gente pueda existir y entrar

El ABM completo (alta, baja/archivado, reasignación) y la invitación del
profesor. **Va primero porque sin esto no hay a quién invitar**: los 7
profesores no tienen correo y no existe la ruta que les dé acceso.

Acá vive el riesgo serio de la fase: el borrado en cascada. Se resuelve con
una regla dura de servidor —no un `confirm()` en el navegador— y con test.

### Paso 2 — Que haya algo que mostrar

Copiar evaluaciones de una cohorte a otra. Es lo que llena la pantalla que el
profesor va a usar. Va antes que el portal por la misma razón que la 013 fue
antes que esta fase: **un portal que estrena su contenido el mismo día que se
estrena a sí mismo son dos cosas rotas al mismo tiempo.**

### Paso 3 — El alcance del profesor, con su test de seguridad

`resolveTeacherScope()`: qué cohortes ve. Se construye y se prueba **antes**
de cualquier pantalla, porque es la regla de la que dependen todas.

El test de SC-002 es el que justifica la fase entera: el profesor A no alcanza
una cohorte del profesor B, y recibe **404, no 403**.

### Paso 4 — Las pantallas del portal

Mis cohortes → la cohorte → tomar asistencia → cargar resultados → material y
anuncios → mis horas.

**La asistencia se diseña para el celular primero** (FR-009/SC-004): es la
única pantalla que se usa de pie, con una mano y en el medio de una clase. El
resto puede ser cómodo en escritorio.

### Paso 5 — Cierre

Gate + E2E extendido + docs.

## Riesgos

- **El borrado en cascada es el riesgo real.** `contact → enrollment → todo`.
  La regla que lo impide va en el servidor y con test; un diálogo de
  confirmación no es una barrera, es un cartel.
- **404 vs 403** es fácil de romper sin darse cuenta: cualquier `if (!puede)
  return 403` lo arruina. Va con test propio.
- **Ovidio Santos tiene 18 cohortes.** La lista del portal tiene que ser
  usable con 18, no con 2.
- **El portal no debe reusar endpoints del staff** (FR-008). Es una tentación
  fuerte porque el roster ya existe — y es exactamente cómo un campo
  financiero termina en la pantalla equivocada.
