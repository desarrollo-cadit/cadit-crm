# Data Model — 012 Identidad y permisos

Asume las propuestas de [research.md](research.md). Si el dueño resuelve
distinto una DV, **este documento se corrige antes de generar la migración**.

## Entidades nuevas

### `account_link` — quién es esta cuenta dentro de la academia

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `alk_` |
| `organization_id` | text NOT NULL FK→organization | constitución III |
| `user_id` | text NOT NULL FK→user ON DELETE cascade | la cuenta de Better Auth |
| `kind` | text NOT NULL | enum: `alumno`, `profesor` |
| `contact_id` | text NULL FK→contact ON DELETE cascade | obligatorio si `kind = alumno` |
| `teacher_id` | text NULL FK→teacher ON DELETE cascade | obligatorio si `kind = profesor` |
| `suspended_at` | timestamp NULL | acceso suspendido (DV-007); la fila NO se borra |
| `created_at` / `updated_at` | timestamp NOT NULL | |

**Índices**: `(organization_id, user_id, kind)` único — una persona puede ser
alumno Y profesor, pero no dos veces lo mismo. `(organization_id, contact_id)`
y `(organization_id, teacher_id)` para resolver la sesión.

**Por qué no se usa `member`**: `member` es la membresía del plugin de
organización de Better Auth y alimenta la pantalla de equipo y los permisos de
staff. Meter 340 alumnos ahí los convierte en personal de la academia con
acceso a los 56 endpoints de `withAuth`.

**Regla de integridad**: `kind = alumno` exige `contact_id` no nulo y
`teacher_id` nulo, y al revés. Se valida en servidor y con un CHECK.

**FR-005b — el alumno nace de la inscripción**: un `account_link` de tipo
`alumno` solo puede crearse si el contacto tiene al menos una fila en
`enrollment`. Se valida en servidor: un CHECK no puede consultar otra tabla.

### `role` — los roles de staff, configurables

| Columna | Tipo | Nota |
|---|---|---|
| `id` | text PK | prefijo `rol_` |
| `organization_id` | text NOT NULL FK→organization | |
| `key` | text NOT NULL | `direccion`, `coordinacion`, `soporte`… |
| `name` | text NOT NULL | rótulo visible |
| `capabilities` | jsonb NOT NULL | lista de capacidades otorgadas |
| `system` | boolean NOT NULL default false | los de sistema no se borran |

**Índices**: `(organization_id, key)` único.

**Por qué `jsonb` y no una tabla puente**: las capacidades son una lista
cerrada definida en código (DV-003). Una tabla puente agregaría joins a cada
verificación de permiso sin agregar ninguna garantía — la garantía la da el
tipo en TypeScript.

## Capacidades (en código, no en base)

Lista cerrada y tipada. La base guarda cuáles tiene cada rol; el compilador
verifica que no se invente ninguna.

```
academico.ver · academico.editar
cobranza.ver · cobranza.editar
asistencia.ver · asistencia.editar
evaluacion.ver · evaluacion.editar
certificados.emitir
contactos.ver · contactos.editar
inbox.ver · inbox.responder
configuracion.editar
accesos.gestionar        ← dar de alta portales
```

**Mapeo inicial (DV-006)** — CORREGIDO 2026-08-26 al implementar la fase 4:

| Rol | Capacidades |
|---|---|
| `direccion` | todas |
| `coordinacion` | todas menos `configuracion.editar` |
| `soporte` | todas menos las tres financieras (`inscripciones.editar`, `cobranza.ver`, `cobranza.editar`) |

**Por qué cambió la fila de `soporte`.** Este documento proyectaba "las `.ver`
no financieras + `asistencia.editar`". La resolución de DV-006 que firmó el
dueño dice otra cosa: `soporte` → "sin capacidades financieras, **como hoy**".
Y "como hoy" es exactamente lo que quedó en `capabilities.ts` en la fase 1:
todo menos las tres financieras.

La diferencia no es de redacción. La proyección le sacaba a las **2 cuentas de
soporte reales** siete capacidades que hoy usan —`academico.editar`,
`contactos.editar`, `evaluacion.editar`, `certificados.emitir`,
`inbox.responder`, `configuracion.editar`, `accesos.gestionar`— sin que nadie
lo hubiera pedido.

Manda la resolución, y no por antigüedad: el encabezado de este documento ya
lo dice —"si el dueño resuelve distinto una DV, este documento se corrige
antes de generar la migración"—. Esto es esa corrección.

## Row-Level Security

### Qué se activa

RLS en **toda tabla de dominio** con `organization_id` — las de auth
(`user`, `session`, `account`, `verification`) quedan afuera: las gestiona
Better Auth y no llevan organización.

### La política

```sql
ALTER TABLE <tabla> ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON <tabla>
  USING (organization_id = current_setting('app.current_org', true));
```

`current_setting(..., true)` devuelve NULL si no está fijada, y la comparación
con NULL es falsa: **una conexión que no declaró organización no ve ninguna
fila**. Ese es exactamente el comportamiento buscado (FR-015).

### Cómo se fija (DV-002, propuesta A)

Cada pedido autenticado corre dentro de una transacción:

```sql
SET LOCAL app.current_org = '<organizationId>';
SET LOCAL app.current_actor = '<userId>';
```

`LOCAL` limita el valor a la transacción: al terminar, la conexión vuelve al
pool limpia. **Sin `LOCAL` el valor queda pegado a la conexión y el pedido
siguiente lo hereda** — esa es la fuga que hay que evitar.

### El dueño de la conexión — verificado, y hoy está mal

```sql
select tableowner from pg_tables where tablename='contact';  →  postgres
```

**La aplicación se conecta como `postgres`**, que es dueño de las tablas y
superusuario. Postgres **saltea RLS para el dueño y para superusuarios**: si
se habilitaran las políticas hoy, no filtrarían absolutamente nada y el
sistema parecería seguro sin serlo.

Por eso T027 (crear un rol de aplicación sujeto a RLS y cambiar
`DATABASE_URL`) **no es un paso opcional de prolijidad: sin él, toda la fase
no protege nada**. Y por eso va último y detrás del test de aislamiento —
corrido con ese rol, no con `postgres`.

### Alcance medido

```sql
select count(*) from information_schema.columns
where column_name='organization_id';  →  33
```

**33 tablas** llevan `organization_id`. Ese es el alcance exacto de la
migración de políticas.

### Transacciones: ya se usan

`getDb().transaction(...)` ya está en uso en `courses.ts` y
`course-content.ts`, así que el envoltorio de DV-002 no introduce un mecanismo
nuevo — extiende uno probado.

## Qué NO se toca

- `member`, `user`, `session`, `account`: intactas. La resolución de sesión del
  staff no cambia (FR-017).
- `scoped()`: sigue en todas las queries. RLS es la segunda red, no la única.
- Las 68 rutas existentes: siguen funcionando igual.

## Migración

Tres pasos, en orden y verificables por separado:

1. **Aditiva**: crea `account_link` y `role`, y siembra los roles de sistema
   con el mapeo de DV-006. Sin tocar nada existente.
2. **RLS**: habilita las políticas. Reversible con `DISABLE ROW LEVEL
   SECURITY`.
3. **Rol de conexión**: crea el rol de aplicación sujeto a RLS y cambia
   `DATABASE_URL`. **Este paso es el que puede dejar la app sin datos si el
   `SET LOCAL` no está funcionando** — va último, y detrás del test de
   aislamiento en verde.
