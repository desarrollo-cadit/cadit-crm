# RLS y el rol de conexión `cadit_app`

Guía operativa del paso más delicado del ciclo 012: pasar la aplicación de
conectarse como `postgres` a conectarse como `cadit_app`.

## Dos cosas distintas que se llaman "rol"

| | Qué es | Dónde vive | Ejemplos |
|---|---|---|---|
| **Rol de la aplicación** | Qué puede hacer una persona | tabla `role` | `direccion`, `coordinacion`, `soporte` |
| **Rol de conexión** | Con qué usuario se conecta la app a PostgreSQL | `pg_roles` | `postgres`, `cadit_app` |

PostgreSQL llama "role" a lo que en la vida diaria es un usuario de base de
datos. No tiene ninguna relación con los roles de `/settings/roles`.

## Por qué hace falta

Row-Level Security filtra filas dentro de la base: cada tabla de dominio tiene
la política `tenant_isolation`, que solo deja ver filas cuya
`organization_id` coincida con `app.current_org`.

**Pero PostgreSQL saltea RLS para el dueño de la tabla y para los
superusuarios**, sin error y sin aviso. Y la app se conecta hoy como
`postgres`, que es las tres cosas a la vez:

```sql
select tableowner from pg_tables where tablename = 'contact';
-- postgres

select rolsuper, rolbypassrls from pg_roles where rolname = 'postgres';
-- t | t
```

Medido sobre una tabla con RLS activo y una política que debería filtrar todo:

| Conectado como | `app.current_org` | Filas visibles |
|---|---|---|
| `postgres` | sin declarar | **2** (RLS salteado) |
| `cadit_app` | sin declarar | **0** |
| `cadit_app` | `org_A` | **1** (solo la suya) |

Lo único que cambia entre las tres es con qué usuario se conecta. Por eso las
políticas de la migración `0025` **no protegen nada** mientras la app sea
`postgres`: están escritas, se ven en `pg_policies`, y no hacen nada.

Eso es peor que no tenerlas, porque invita a creerse cubierto.

## Qué hace la migración `0026`

Crea `cadit_app` **sin contraseña** y le da lo justo:

- `connect` a la base y `usage` sobre el esquema `public`
- `select, insert, update, delete` sobre las tablas actuales y las futuras
  (`alter default privileges`)
- `usage, select` sobre las secuencias

Y deliberadamente **no** le da: `truncate` (RLS no lo filtra, vacía la tabla
entera), `references`, DDL, `createdb`, `createrole`, `superuser` ni
`bypassrls`. Tampoco es dueño de ninguna tabla.

Las tres formas de saltear RLS —ser dueño, ser superusuario, tener
`bypassrls`— están cerradas. Cerrar dos y dejar una abierta no sirve de nada.

## Poner la contraseña

La migración no la fija: un secreto dentro de una migración queda versionado
en git para siempre.

```bash
docker exec -it vocero-dev-postgres-1 psql -U postgres -d vocero \
  -c "alter role cadit_app password 'LA-QUE-GENERES';"
```

Generá una larga y aleatoria (`openssl rand -base64 32`).

## Cambiar `DATABASE_URL` (T028) — el punto de no retorno

**Primero contra base efímera. Siempre.**

```bash
# 1. Base de prueba, migrada
docker exec vocero-dev-postgres-1 psql -U postgres -c "create database vocero_e2e;"
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/vocero_e2e pnpm db:migrate

# 2. Verificar que RLS filtra de verdad con el rol de aplicación
RLS_OWNER_URL=postgresql://postgres:postgres@localhost:5433/vocero_e2e \
RLS_APP_URL=postgresql://cadit_app:LA-CLAVE@localhost:5433/vocero_e2e \
  pnpm verify-rls

# 3. Levantar la app apuntando a cadit_app y correr el arnés completo
#    (.env.e2e con DATABASE_URL=postgresql://cadit_app:...)
NEXT_DIST_DIR=.next-e2e node --env-file=.env.e2e \
  node_modules/next/dist/bin/next dev -p 3005 > e2e-dev.log 2>&1 &
node --env-file=.env.e2e scripts/e2e-selftest.mjs
```

Recién con eso en verde se cambia `DATABASE_URL` en desarrollo.

### Qué se rompe si algo falla

Si el envoltorio de transacción (`src/lib/db/with-tenant.ts`) no llega a fijar
`app.current_org` en algún camino, ese camino **deja de ver datos**: cero
filas, sin error y sin explicación. No es una falla ruidosa.

Los lugares a mirar si eso pasa:

1. Código que llama `getDb()` **fuera** de un pedido autenticado (trabajo de
   fondo del agente o del Laboratorio). Usa el cliente raíz, sin organización
   declarada, así que no ve nada. Si necesita datos, tiene que envolverse él
   mismo con `withTenantTransaction`.
2. Rutas que no pasan por `withAuth` / `requireCapability`: las públicas
   (`/api/public/*`), el webhook de Meta y `/api/events`.

### Las cuatro tablas sin RLS, y por qué

`member`, `account_link`, `role` e `invitation` quedan fuera de las políticas.
No es una excepción de conveniencia: son las tablas que responden *"¿de qué
organización es este usuario?"*, y se leen **antes** de que exista una
organización que declarar. Con la política puesta, la sesión no resolvería
nunca y no entraría nadie.

Las cuatro siguen pasando por `scoped()` en el código, y ninguna guarda datos
personales ni de negocio: son permisos y vínculos.

## Volver atrás

Crear el rol y habilitar las políticas es reversible sin perder datos:

```sql
-- Desactivar las políticas (la app vuelve a ver todo)
alter table contact disable row level security;  -- y el resto

-- O simplemente volver DATABASE_URL a postgres: el dueño saltea RLS igual.
```

Devolver `DATABASE_URL` a `postgres` es la salida rápida si algo sale mal en
producción: no requiere tocar el esquema.
