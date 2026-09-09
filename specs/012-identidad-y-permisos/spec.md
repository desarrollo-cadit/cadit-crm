# 012 — Identidad y permisos

**Estado**: **IMPLEMENTADA** (2026-08-27) · **Depende de**: — · **Habilita**: 013, 014, 015, 016, 017

> Las 32 tareas de [tasks.md](tasks.md) están cerradas y verificadas.
> **413 tests** en 53 archivos · self-test E2E **84/84** con la app conectada
> como `cadit_app` · `pnpm verify-rls` **11/11** · verificación en vivo contra
> la base de desarrollo real **10/10**.
>
> Migraciones `0023`–`0028` aplicadas en desarrollo, cada una con backup
> previo. Las 4 cuentas quedaron en Dirección (17 capacidades), Coordinación
> (16) y dos de Soporte (14), con 340 contactos y 383 inscripciones intactos.
>
> Los dos documentos que se corrigieron durante la implementación
> —[data-model.md](data-model.md) por el choque de DV-006 y las cinco tablas
> excluidas de RLS— tienen el motivo escrito en su lugar. El procedimiento
> operativo del rol de conexión vive en
> [`docs/rls-rol-de-conexion.md`](../../docs/rls-rol-de-conexion.md).

## Por qué esta fase existe

Hoy el sistema tiene **una sola audiencia**. Toda su seguridad se apoya en una
premisa que deja de ser cierta en cuanto entre alguien que no sea del staff:

> quien está logueado es miembro de la organización y ve todo lo que hay en
> ella.

Los 56 endpoints con `withAuth` no verifican nada más que eso. El día que un
alumno tenga cuenta, los 56 le quedan abiertos.

Esta fase NO agrega ninguna pantalla nueva para el usuario final. Agrega el
modelo de identidad y la maquinaria de permisos que hace que las fases 014-017
sean posibles sin abrir un agujero. Es la fundación, y por eso va primera.

## Estado medido del aislamiento

| | Hoy |
|---|---|
| Políticas RLS en Postgres | **0** |
| Aislamiento | `scoped()`, convención de código |
| Roles | `owner`, `member`, `soporte` (los tres, staff) |
| Cuentas | 4 · ningún alumno, ningún profesor |

`scoped()` funciona, pero es una disciplina: una query que se olvide de usarlo
devuelve datos de toda la base sin que nada lo impida. Con una audiencia el
riesgo es tolerable. Con tres, no.

## User Scenarios

### US1 — Dirección puede todo (Priority: P1)

Como dueño de la academia quiero un rol que pueda operar **toda** la
plataforma —académico, comercial, financiero y de configuración— sin que
ninguna pantalla le esconda nada, para no quedar bloqueado por un permiso mal
puesto mientras el resto de los roles se van armando.

**Por qué primero**: es la garantía de que ninguna fase posterior te deje sin
acceso a tu propio sistema.

### US2 — Cada persona de la comunidad tiene identidad (Priority: P1)

Como academia quiero que alumnos, profesores y staff existan como cuentas
distinguibles, vinculadas a su ficha (contacto o profesor), para poder darles
acceso sin convertirlos a todos en "miembros de la organización".

**Escenario clave**: 340 alumnos con cuenta NO deben aparecer en la pantalla
de equipo ni heredar los permisos de un miembro del staff.

### US3 — El alumno nace de la inscripción, no del lead (Priority: P1)

Como academia quiero que la cuenta de alumno se cree **solo cuando la persona
se inscribe a una cohorte**, no cuando entra como consulta, para que el portal
tenga adentro a quienes cursan y no a todo el que alguna vez preguntó un
precio.

**Por qué importa**: hoy `contact` mezcla dos cosas distintas —el interesado
que pidió información y el alumno que cursa— y hasta ahora daba igual porque
nadie de afuera entraba al sistema. Con portal, la diferencia es el criterio
que decide quién tiene llave.

**Escenarios**:
- Llega un lead por el formulario del sitio → contacto sí, cuenta no.
- Ese lead se inscribe a una cohorte → recién ahí se le habilita el acceso.
- Un contacto con inscripción cancelada o reembolsada → ver DV-007.
- El alumno terminó de cursar hace dos años → ver DV-005.

### US4 — La base se defiende sola (Priority: P1)

Como responsable del sistema quiero que PostgreSQL rechace por sí mismo una
query que no declare su organización, para que un olvido en el código no se
convierta en una fuga de datos entre organizaciones.

### US5 — Permisos legibles y auditables (Priority: P2)

Como dueño quiero ver qué puede hacer cada rol en una pantalla, y cambiarlo
sin tocar código, para no depender de un desarrollador cada vez que cambia
quién hace qué.

### US6 — El front oculta lo que el servidor prohíbe (Priority: P2)

Como usuario de cualquier rol quiero no ver botones ni menús de cosas que no
puedo hacer, para no toparme con errores de permiso ni confundirme sobre mi
propio alcance.

## Requirements

### Identidad

- **FR-001**: El sistema DEBE distinguir tres clases de identidad: **staff**,
  **profesor** y **alumno**.
- **FR-002**: Una cuenta de alumno DEBE vincularse a su `contact` existente;
  una de profesor, a su `teacher`. No se duplican los datos personales.
- **FR-003**: Las cuentas de alumno y profesor NO DEBEN ser miembros de la
  organización en el sentido del plugin de auth: no aparecen en la pantalla de
  equipo ni heredan permisos de staff.
- **FR-004**: Una misma persona PUEDE ser alumno y profesor a la vez (un
  egresado que después da clases). La identidad es una; los roles se suman.
- **FR-005**: Dar de alta el acceso DEBE ser una acción explícita del staff.
  Importar 340 alumnos no crea 340 cuentas.
- **FR-005b**: Una cuenta de alumno SOLO puede existir si el contacto tiene al
  menos una inscripción a una cohorte. Un lead sin inscripción NO puede tener
  acceso al portal.
- **FR-005c**: El sistema DEBE distinguir en la ficha del contacto si es lead,
  alumno (tiene inscripción) o ambas cosas a lo largo del tiempo, sin duplicar
  la persona.

### Permisos

- **FR-006**: DEBE existir un rol de máximo alcance (dirección) con acceso a
  toda la plataforma.
- **FR-007**: Los permisos DEBEN expresarse como capacidades nombradas (ej.
  `cobranza.ver`, `asistencia.editar`), no como comparaciones de rol
  dispersas por el código.
- **FR-008**: Todo endpoint DEBE declarar qué capacidad exige. Un endpoint sin
  declaración DEBE fallar cerrado, nunca abierto.
- **FR-009**: El sistema DEBE poder responder "¿qué puede hacer esta persona?"
  en una sola consulta, para que el front oculte sin adivinar.

### Sesión (choque detectado con el código actual)

`requireSession()` hoy resuelve la organización con
`resolveMembership(userId)` y **lanza `UnauthorizedError` si no hay fila de
`member`**. Como FR-003 dice que alumnos y profesores NO son miembros, con el
código actual quedarían sin sesión válida: las dos reglas juntas no funcionan.

- **FR-016**: DEBE existir una resolución de sesión propia para los portales,
  que obtenga organización e identidad desde el vínculo de cuenta y NO desde
  `member`.
- **FR-017**: `requireSession()` actual NO DEBE cambiar de comportamiento para
  el staff. La resolución nueva es adicional, no un reemplazo: cambiarla
  arriesga las 68 rutas que ya dependen de ella.
- **FR-018**: Una sesión de portal NO DEBE poder satisfacer `withAuth` ni
  `requireFullAccess`, aunque el usuario esté correctamente autenticado.

### Aislamiento

- **FR-010**: PostgreSQL DEBE tener RLS habilitado en toda tabla de dominio,
  con política por `organization_id`.
- **FR-011**: RLS se agrega SOBRE `scoped()`, no lo reemplaza (defensa en
  profundidad). Quitar `scoped()` queda explícitamente fuera de alcance.
- **FR-012**: La conexión DEBE fijar la organización y la identidad actuales
  de forma que no puedan filtrarse entre pedidos que comparten el pool.
- **FR-013**: Un alumno o profesor NO DEBE poder alcanzar los endpoints de
  staff, ni siquiera para recibir 403: sus superficies son distintas
  (`/api/portal/*` vs `/api/*`).

### Verificación

- **FR-014**: DEBE existir un test que, para cada endpoint, verifique que un
  rol sin la capacidad recibe 403 **sin que la consulta llegue a la base**.
- **FR-015**: DEBE existir un test de aislamiento que confirme que una query
  sin organización declarada no devuelve filas, con RLS activo.

## Decisiones a verificar

- **DV-001**: ¿Los alumnos y profesores viven en la tabla `user` de Better
  Auth con una tabla de vínculo, o en su propio espacio de identidad?
  *(propuesta: `user` + tabla de vínculo `account_link(user_id, kind,
  contact_id|teacher_id, organization_id)`. Reusa login, recuperación y
  sesiones ya probados, sin ensuciar `member`.)*
- **DV-002**: ¿Cómo viaja la identidad a PostgreSQL para RLS? Con pool de
  conexiones, `SET LOCAL` solo es seguro dentro de una transacción.
  *(propuesta: envolver cada pedido autenticado en una transacción que fije
  `app.current_org` y `app.current_actor`. Impacta a TODAS las queries, es la
  decisión de mayor riesgo técnico de la fase.)*
- **DV-003**: ¿Los permisos son por rol fijo o configurables por el dueño?
  *(propuesta: capacidades fijas en código, roles configurables en base. Lo
  primero se prueba, lo segundo se edita.)*
- **DV-004**: ¿Cómo recibe su acceso un alumno? ¿Invitación por correo (M365,
  ya integrado), enlace de un solo uso, o contraseña que fija el staff?
- **DV-005**: ¿Qué pasa con un alumno que cursó y terminó? ¿Conserva acceso al
  legajo para siempre, o caduca?
- **DV-007**: ¿Qué pasa con el acceso cuando una inscripción se cancela o se
  reembolsa? *(propuesta: el acceso se suspende pero la cuenta y el legajo NO
  se borran — la persona puede volver a inscribirse y su historial importa.)*
- **DV-008**: ¿El acceso se habilita solo al inscribir, o también hay que
  invitarlo aparte? *(propuesta: la inscripción lo habilita, pero la
  invitación es un paso explícito del staff — inscribir a alguien no debería
  disparar un correo sin que nadie lo decida.)*
- **DV-006**: ¿Los 4 usuarios actuales se migran a los roles nuevos, y con
  qué correspondencia? `owner`→dirección, `member`→coordinación,
  `soporte`→soporte parece directo, pero conviene confirmarlo.

## Success Criteria

- **SC-001**: Dirección opera toda la plataforma sin encontrar una pantalla
  bloqueada.
- **SC-002**: Con RLS activo, una query sin organización declarada devuelve
  cero filas — verificado por test.
- **SC-003**: Ningún endpoint queda sin capacidad declarada — verificado por
  un test que recorra el árbol de rutas.
- **SC-004**: Las 4 cuentas actuales siguen funcionando igual después de la
  migración de roles.
- **SC-005**: El gate técnico completo sigue en verde, incluido `pnpm test:e2e`.

## Out of Scope

- Portales de profesor y alumno (son 014 y 015; acá solo se habilita el
  modelo que los hace posibles).
- Autenticación de dos factores.
- Inicio de sesión con Google/Microsoft.
- Auditoría completa de acciones (quién cambió qué y cuándo) — merece su
  propia fase.

## Riesgos

| Riesgo | Por qué importa | Mitigación |
|---|---|---|
| RLS + pool de conexiones | `SET LOCAL` fuera de transacción se filtra entre pedidos. Es la falla más peligrosa: silenciosa y cruzada. | DV-002 resuelta antes de escribir código; test de aislamiento explícito |
| Migrar los roles actuales | Un error deja al dueño afuera de su propio sistema | La migración se prueba contra base efímera antes de la real |
| Alcance | Es la fase más invasiva del proyecto: toca los 83 endpoints | No agrega pantallas nuevas; se mide por tests, no por funciones visibles |
