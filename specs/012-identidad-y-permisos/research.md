# Research — 012 Identidad y permisos

Cada decisión trae su impacto y una propuesta. **Las ocho quedaron resueltas
con el dueño el 2026-08-26** — T001 está cumplida.

---

## DV-001 — ¿Dónde viven las identidades de alumno y profesor?

**Pregunta**: ¿en la tabla `user` de Better Auth con una tabla de vínculo, o
en un espacio de identidad propio?

**Impacto**: alto. Define si se reusa login, recuperación de contraseña y
sesiones ya probados, o si hay que construirlos de nuevo.

**Contexto medido**: `member` tiene hoy 4 filas. Si los 340 alumnos entraran
ahí, la pantalla de equipo pasaría de 4 a 344 filas y todos heredarían los
permisos de un miembro del staff.

**Propuesta**: `user` de Better Auth + tabla `account_link`:

```
account_link(id, organization_id, user_id, kind, contact_id?, teacher_id?)
kind ∈ (alumno, profesor)
```

Reusa lo probado, no ensucia `member`, y permite que una persona sea alumno y
profesor a la vez (FR-004) con dos filas.

**Resolución**: RESUELTA — `user` de Better Auth + tabla `account_link`. Reusa login, recuperación y sesiones ya probados, y no ensucia `member` con 340 personas. (2026-08-26)

---

## DV-002 — ¿Cómo viaja la identidad a PostgreSQL para RLS?

**Pregunta**: RLS necesita saber, dentro de la base, qué organización y qué
actor está consultando. ¿Cómo llega ese dato?

**Impacto**: **el más alto de la fase, y el más peligroso.** Con pool de
conexiones (`postgres` con `max: 10`), `SET` sin `LOCAL` deja el valor pegado a
la conexión: el pedido siguiente que tome esa conexión hereda la organización
del anterior. Sería una fuga entre organizaciones, silenciosa y sin error.

**Opciones**:

| | Cómo | Riesgo |
|---|---|---|
| A | `SET LOCAL` dentro de una transacción por pedido | Obliga a que TODA query pase por transacción |
| B | Una conexión dedicada por pedido | Agota el pool con concurrencia real |
| C | RLS solo con `current_setting` opcional y `scoped()` como filtro principal | Menos garantía, cero riesgo de fuga |

**Propuesta**: opción **A**, con un helper que envuelva el handler autenticado
en `db.transaction()` fijando `app.current_org` y `app.current_actor`. Es
invasivo pero es el único que da la garantía real. Y va acompañado de un test
que abra dos pedidos concurrentes con organizaciones distintas y verifique que
ninguno ve al otro.

**Alternativa si A resulta demasiado invasiva**: empezar por **C** —RLS
declarado y activo, pero con `scoped()` sosteniendo el filtrado— y migrar a A
por módulos. Peor garantía, pero entregable sin reescribir 83 rutas de una vez.

**Resolución**: RESUELTA — **opción A: transacción por pedido con `SET LOCAL`**. Es la única que da garantía real; se asume el costo de que toque todas las queries y se mide la latencia en el paso 5.2 antes de seguir. (2026-08-26)

---

## DV-003 — ¿Permisos por rol fijo o configurables?

**Impacto**: medio. Define si cambiar quién hace qué es una tarea de producto
o de desarrollo.

**Propuesta**: capacidades **fijas en código** (una lista cerrada, tipada, que
el compilador verifica), roles **configurables en base** (qué capacidades tiene
cada rol). Lo primero se prueba con tests; lo segundo se edita sin desplegar.

**Resolución**: RESUELTA — capacidades FIJAS en código (lista cerrada y tipada), roles CONFIGURABLES en base. (2026-08-26)

---

## DV-004 — ¿Cómo recibe su acceso un alumno?

**Contexto medido**: de los 340 contactos, **6 no tienen correo**.

**Opciones**: invitación por correo (M365 ya integrado, ciclo 007), enlace de
un solo uso que se manda por WhatsApp (el canal que la academia ya usa), o
contraseña que fija el staff.

**Propuesta**: invitación por correo como camino principal, con **enlace de un
solo uso por WhatsApp** como alternativa — es el canal donde la academia ya
conversa con sus alumnos y resuelve los 6 casos sin correo.

**Resolución**: RESUELTA — **solo invitación por correo**, sin camino por WhatsApp. Y una restricción operativa explícita del dueño: **a los 340 alumnos actuales NO se les envía nada todavía**. La invitación es de a uno y decidida por el staff; el despliegue de la fase no puede disparar ningún envío masivo. Los 6 contactos sin correo quedan sin acceso hasta que alguien les cargue uno. (2026-08-26)

---

## DV-005 — ¿El acceso caduca cuando el alumno termina?

**Impacto**: medio. Afecta a la mayoría de los 340: casi todos son de cohortes
ya finalizadas.

**Propuesta**: **no caduca**. El legajo, el certificado y las grabaciones son
justamente lo que un egresado vuelve a buscar, y un egresado con acceso es un
candidato al próximo curso. Si algún día molesta, se agrega caducidad; lo
contrario (dar acceso que antes se quitó) es más difícil de explicar.

**Resolución**: RESUELTA — el acceso **NO caduca**. El legajo, el certificado y las grabaciones son lo que un egresado vuelve a buscar, y un egresado con acceso es candidato al próximo curso. (2026-08-26)

---

## DV-006 — ¿Cómo se migran los 4 usuarios actuales?

**Contexto medido**: `owner` 1, `member` 1, `soporte` 2.

**Propuesta**: `owner` → **dirección** (todas las capacidades), `member` →
**coordinación**, `soporte` → **soporte** (sin capacidades financieras, como
hoy). La migración corre contra base efímera antes que contra la real, y se
verifica que las 4 cuentas siguen entrando.

**Resolución**: RESUELTA — `owner`→dirección (todas las capacidades), `member`→coordinación, `soporte`→soporte (sin capacidades financieras, como hoy). Migración verificada contra base efímera antes que contra la real. (2026-08-26)

---

## DV-007 — ¿Qué pasa con el acceso si se cancela la inscripción?

**Propuesta**: el acceso se **suspende**, la cuenta y el legajo NO se borran.
La persona puede volver a inscribirse, y su historial —lo que cursó antes—
sigue siendo cierto.

**Resolución**: RESUELTA — el acceso se SUSPENDE; la cuenta y el legajo NO se borran. La persona puede volver a inscribirse y lo que cursó antes sigue siendo cierto. (2026-08-26)

---

## DV-008 — ¿Inscribir habilita el acceso automáticamente?

**Impacto**: medio. Es la diferencia entre "el sistema le mandó un mail a
alguien" y "alguien decidió mandárselo".

**Propuesta**: la inscripción **habilita** (cumple FR-005b) pero la
**invitación es un paso explícito** del staff. Inscribir a alguien no debería
disparar un correo sin que nadie lo decida — el mismo criterio que se usó para
el correo de bienvenida en el ciclo 007.

**Resolución**: RESUELTA — la inscripción HABILITA el acceso (FR-005b) pero la invitación es un paso EXPLÍCITO del staff. Refuerza la restricción de DV-004: inscribir a alguien nunca dispara un correo por sí solo. (2026-08-26)

---

## Fuera de discusión (ya decidido)

- **Todo dentro de esta aplicación**, no una academia aparte. Ver ROADMAP.
- **Las empresas no tienen login.** Reporte exportable, no audiencia.
- **RLS se suma a `scoped()`**, no lo reemplaza.
