# Réplica de la base en Coolify

Guía operativa para crear el servicio de PostgreSQL en Coolify y cargarle
**todos los datos actuales** de la base local, dejando el aislamiento entre
organizaciones (RLS) funcionando de verdad.

**Decisión del dueño, cerrada:** la base queda **sólo en la red interna** de
Coolify, sin puerto público. La carga se hace por **túnel SSH** al host. No hay
motivo técnico que lo impida — el túnel se probó conceptualmente y `pg_restore`
no distingue si el 5432 del otro lado llegó por red directa o reenviado.

Complemento obligatorio: [`rls-rol-de-conexion.md`](./rls-rol-de-conexion.md),
que explica *por qué* la app se conecta como `cadit_app` y no como `postgres`.

---

## Lo que hay que saber antes de empezar

Cinco cosas que hacen fracasar esta migración, en orden de qué tan caro sale
descubrirlas tarde.

### 1. `pg_dump` no exporta el rol de conexión

Los roles son objetos de **cluster**, no de base. El dump lleva las tablas, los
datos, las políticas RLS y los GRANT — pero **no** lleva `cadit_app`.

Verificado sobre el dump real de `vocero` (2026-09-09):

| Qué | Viaja en el dump |
|---|---|
| Datos (`TABLE DATA`) | 44 entradas ✅ |
| Políticas (`POLICY`) | 33 entradas ✅ |
| Activación de RLS (`ROW SECURITY`) | 33 entradas ✅ |
| Permisos (`ACL`) | 46 entradas ✅ |
| **El rol `cadit_app`** | ❌ **no** |

Las políticas son `to public`, así que restauran sin el rol. **Los ACL lo
nombran**, así que fallan.

### 2. `pg_restore` falla en silencio y devuelve éxito

Restaurar sin crear el rol antes produce esto — medido, no supuesto:

```
pg_restore: error: could not execute query: ERROR:  role "cadit_app" does not exist
Command was: GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.virtual_room TO cadit_app;
...
pg_restore: warning: errors ignored on restore: 46
```

Y a continuación **`echo $?` devuelve `0`**. La base queda con todos los datos,
todas las políticas, y la app sin poder leer una sola fila.

> **Por eso el runbook usa siempre `--exit-on-error`.** Sin ese flag el error no
> se nota hasta que la app está arriba devolviendo pantallas vacías.

### 3. El contenedor migra al arrancar, y `cadit_app` no puede

Ésta es la trampa grande, y no está documentada en ningún otro lado.

El `Dockerfile` termina en:

```dockerfile
CMD ["sh", "-c", "node migrate.mjs && node server.js"]
```

`migrate.mjs` lee **la misma `DATABASE_URL` que la app**. No hay una variable
separada para migrar. Y el migrador de drizzle ejecuta, siempre,
`create schema if not exists drizzle`.

PostgreSQL exige el privilegio `CREATE` **sobre la base** para esa sentencia
**aunque el esquema ya exista**. `cadit_app` no lo tiene: es un rol capado a
propósito. Resultado, verificado corriendo el `migrate.mjs` real contra una
copia restaurada:

```
[migrate] falló tras varios intentos: PostgresError: permission denied for database vocero
```

Con **cero migraciones pendientes**. El `&&` corta ahí: `server.js` nunca
arranca, el healthcheck nunca responde, y Coolify marca el deploy como fallido.

**Ojo con el diagnóstico**: antes de mostrar la causa real, el script imprime
14 veces `[migrate] BD no lista (intento N/15), reintento en 2s…` durante ~30
segundos. Parece un problema de red o de arranque de la base. **No lo es: es de
permisos.**

El [paso 6](#6-los-tres-grants-que-dejan-arrancar-el-contenedor) resuelve esto
con tres GRANT que **no** debilitan RLS.

### 4. La migración `0038` hay que aplicarla a mano

Estado real del origen, verificado hoy:

- 38 migraciones aplicadas → `0000` … `0037`.
- `0038_curso_otorga_certificado` está en el repo, **no aplicada**
  (la columna `course.grants_certificate` no existe en el origen).

Como el dump viaja con `drizzle.__drizzle_migrations` en la 0037, al levantar la
app en Coolify quedaría una migración pendiente. Y una migración **DDL**
pendiente falla cerrado incluso con los tres GRANT del paso 6:

```
[migrate] falló tras varios intentos: PostgresError: must be owner of table course
```

**Decisión recomendada: aplicarla a mano como `postgres`, antes del primer
arranque de la app** (paso 7). Es lo que hace este runbook.

No es una preferencia estética: la alternativa —dejar que el contenedor la
aplique— **no existe**, porque `cadit_app` no puede. La regla es permanente:
**toda migración nueva se aplica a mano como `postgres` antes de desplegar.**

### 5. La versión del destino no puede ser menor que la del origen

Origen: **PostgreSQL 16.14**. El servicio de Coolify debe ser **16.x** (o
mayor). Un `pg_restore` de un dump 16 sobre un servidor 15 falla.

---

## Valores que tiene que proveer el dueño

**Ninguno de estos se inventa ni se adivina.** Sin ellos el runbook no corre.
En todo lo que sigue aparecen como marcadores `<ASÍ>`.

| Marcador | Qué es | Cómo se obtiene |
|---|---|---|
| `<COOLIFY_URL>` | URL del panel | La del servidor de Coolify |
| `<COOLIFY_USUARIO>` / `<COOLIFY_PASSWORD>` | Acceso al panel | Del dueño |
| `<SSH_USUARIO>` | Usuario SSH del host | Normalmente `root` |
| `<SSH_HOST>` | IP o dominio del host | El del servidor de Coolify |
| `<SSH_KEY>` | Ruta a la clave privada | La que ya usa el dueño |
| `<PG_PASSWORD_COOLIFY>` | Contraseña del superusuario del servicio | **La genera Coolify** al crear el servicio; se copia del panel |
| `<PG_HOST_INTERNO>` | Hostname interno del servicio | Lo asigna Coolify (ej. `postgresql-abc123`); se lee del panel |
| `<CADIT_APP_PASSWORD>` | Contraseña **nueva** de `cadit_app` en el destino | **La genera el dueño**: `openssl rand -base64 32` |
| `<POSTGRES_PASSWORD_LOCAL>` | Contraseña de `postgres` en la base local | Del `.env` local (default del compose: `postgres`) |

> `<CADIT_APP_PASSWORD>` es **nueva y distinta** de la de desarrollo. No se
> reutiliza la local.

**Nunca** pegar estos valores en un chat, un commit, un log ni un ticket. Van
sólo al panel de Coolify y, si hace falta, a un gestor de contraseñas.

---

## Paso a paso

### 1. Crear el servicio de PostgreSQL en Coolify

En el panel:

1. **Project → Resources → + New → Database → PostgreSQL**.
2. **Versión: `16`** (obligatorio, ver punto 5 de arriba).
3. Nombre del servicio: `cadit-postgres` (o el que prefieras).
4. **NO habilitar "Public Port" / "Make it publicly available".** Es la decisión
   del dueño: la base queda sólo en la red interna.
5. Deploy.

Cuando termine, anotar del panel:

- El **hostname interno** → `<PG_HOST_INTERNO>`.
- La **contraseña del superusuario** → `<PG_PASSWORD_COOLIFY>`.

Coolify crea la base con el nombre que figure en el panel. Este runbook asume
que se llama **`vocero`**; si Coolify la creó con otro nombre, ajustá `-d vocero`
en todos los comandos.

### 2. Dump del origen (sólo lectura)

La base local es producción. **No se migra, no se altera, no se le corre nada
que escriba.** `pg_dump` sólo lee.

```bash
# Confirmar el estado del origen ANTES de copiarlo
docker exec vocero-dev-postgres-1 psql -U postgres -d vocero -tAc \
  "select count(*) from drizzle.__drizzle_migrations;"   # debe dar 38

# Dump en formato custom, dentro del contenedor
docker exec vocero-dev-postgres-1 \
  pg_dump -U postgres -d vocero -Fc -f /tmp/vocero.dump

# Sacarlo al disco del dueño
docker cp vocero-dev-postgres-1:/tmp/vocero.dump ./vocero.dump
ls -lh ./vocero.dump    # referencia: ~216 KB / base de 12 MB
```

> En Git Bash sobre Windows, si `docker cp` se queja de la ruta, anteponer
> `MSYS_NO_PATHCONV=1`.

Guardar también el conteo del origen para comparar después:

```bash
docker exec vocero-dev-postgres-1 psql -U postgres -d vocero -tA -c "
select c.relname || '|' || (xpath('/row/cnt/text()',
  query_to_xml(format('select count(*) as cnt from public.%I', c.relname),
  false, true, '')))[1]::text::bigint
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;" > origen-conteos.txt
```

### 3. Abrir el túnel SSH

La base no tiene puerto público, así que se llega por el host. El túnel
reenvía el `5432` del contenedor de Postgres al `5432` local.

Primero, averiguar el nombre del contenedor y su IP interna, **por SSH**:

```bash
ssh -i <SSH_KEY> <SSH_USUARIO>@<SSH_HOST> \
  "docker ps --format '{{.Names}}\t{{.Image}}' | grep -i postgres"
```

Con ese nombre, el túnel. En una terminal aparte, y **dejarla abierta**:

```bash
ssh -i <SSH_KEY> -N \
  -L 15432:<PG_HOST_INTERNO>:5432 \
  <SSH_USUARIO>@<SSH_HOST>
```

`-N` = no abrir shell, sólo el túnel. Puerto local `15432` para no chocar con
un Postgres local.

> **Si `<PG_HOST_INTERNO>` no resuelve** desde el host (pasa cuando el servicio
> corre en una red Docker propia), usar la IP del contenedor:
>
> ```bash
> ssh -i <SSH_KEY> <SSH_USUARIO>@<SSH_HOST> \
>   "docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}} {{end}}' <NOMBRE_CONTENEDOR>"
> ```
>
> y reemplazar en el `-L 15432:<ESA_IP>:5432`.

Comprobar que el túnel llegó:

```bash
PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 -U postgres \
  -d postgres -tAc "select version();"
```

Tiene que responder `PostgreSQL 16.x`.

### 4. Crear el rol `cadit_app` — antes de restaurar

**Este es el paso que se olvida.** Va antes del restore, no después: los GRANT
del dump lo nombran.

```bash
PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 -U postgres \
  -d postgres -v ON_ERROR_STOP=1 <<SQL
create role cadit_app login password '<CADIT_APP_PASSWORD>';
SQL
```

Si Coolify **no** creó todavía la base `vocero`:

```bash
PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 -U postgres \
  -d postgres -v ON_ERROR_STOP=1 -c "create database vocero;"
```

Y el `connect` (no viene en el dump: `grant on database` es del cluster):

```bash
PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 -U postgres \
  -d postgres -v ON_ERROR_STOP=1 \
  -c "grant connect on database vocero to cadit_app;"
```

### 5. Restaurar

```bash
PGPASSWORD='<PG_PASSWORD_COOLIFY>' pg_restore \
  -h 127.0.0.1 -p 15432 -U postgres \
  -d vocero \
  --no-owner \
  --exit-on-error \
  ./vocero.dump

echo "exit=$?"   # tiene que ser 0
```

- `--no-owner`: el dueño de las tablas pasa a ser el superusuario del destino,
  que puede llamarse distinto. No afecta a RLS: lo que importa es que
  `cadit_app` **no** sea el dueño.
- `--exit-on-error`: convierte el fallo silencioso en un fallo ruidoso.

**Si aparece `role "cadit_app" does not exist`**, el paso 4 no se corrió.
Borrar la base y rehacer desde el paso 4 — no parchear encima.

### 6. Los tres GRANT que dejan arrancar el contenedor

Sin esto el contenedor de la app **no arranca nunca** (punto 3 de arriba).

```bash
PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 -U postgres \
  -d vocero -v ON_ERROR_STOP=1 <<'SQL'
-- Para que `create schema if not exists drizzle` del migrador no falle.
grant create on database vocero to cadit_app;
-- Para leer y anotar en la tabla de control de migraciones.
grant usage, create on schema drizzle to cadit_app;
grant select, insert on all tables in schema drizzle to cadit_app;
SQL
```

**Estos tres GRANT no debilitan el aislamiento.** Verificado en vivo después de
aplicarlos: `cadit_app` sigue sin `superuser`, sin `bypassrls`, sin poseer
ninguna tabla, y sigue viendo **0 filas** sin `app.current_org` declarado. Lo
único que gana es poder crear objetos nuevos y anotar migraciones — no leer las
filas de otra organización.

Lo que **siguen sin destrabar**: una migración DDL pendiente. Eso es
deliberado; ver el paso 7.

> **`all tables in schema` es una foto, no una regla.** Ese `grant` alcanza a las
> tablas que existen **en el momento de correrlo**, no a las futuras. Hoy el
> esquema `drizzle` tiene una sola tabla y la crea el propio migrador corriendo
> como `postgres`, así que alcanza. Si una versión futura de drizzle-kit agrega
> otra, el `grant` no la va a cubrir y el síntoma va a ser un `permission denied`
> en el arranque del contenedor, no acá. Si eso pasa, la respuesta no es repetir
> el `grant` a mano sino:
>
> ```sql
> alter default privileges in schema drizzle
>   grant select, insert on tables to cadit_app;
> ```

### 7. Aplicar la migración `0038` a mano

Se aplica con el **mismo `migrate.mjs` que usa el contenedor**, pero corriéndolo
desde la máquina del dueño y **como `postgres`**, con el túnel abierto:

```bash
DATABASE_URL="postgresql://postgres:<PG_PASSWORD_COOLIFY>@127.0.0.1:15432/vocero" \
MIGRATIONS_DIR="$PWD/drizzle" \
  node scripts/migrate.mjs
# -> [migrate] migraciones aplicadas
```

Esto se verificó de punta a punta contra una copia restaurada: dejó la tabla de
control en **39** migraciones y la columna `grants_certificate` creada.

> **Por qué así y no `psql -f drizzle/0038_....sql`:** el archivo se aplicaría
> igual (es `add column if not exists`, re-ejecutable), pero **no quedaría
> anotado** en `drizzle.__drizzle_migrations`. El contenedor la vería pendiente
> al arrancar, intentaría aplicarla como `cadit_app` y fallaría con
> `must be owner of table course`.
>
> Anotarla a mano tampoco sirve: drizzle compara **por el SHA-256 del contenido
> del archivo**, y calcular ese hash desde SQL es frágil (depende de los
> finales de línea). Dejar que `migrate.mjs` haga las dos cosas —aplicar y
> anotar con el hash correcto— es la única forma probada.

### 8. Variables de entorno de la app en Coolify

En el recurso de la **aplicación** (no en el de la base), como variables de
**runtime**, *no* de build.

**Obligatorias** (la app no arranca sin ellas — `src/lib/env.ts` las valida):

| Variable | Valor |
|---|---|
| `APP_BASE_URL` | La URL pública de la app, con `https://` |
| `DATABASE_URL` | `postgresql://cadit_app:<CADIT_APP_PASSWORD>@<PG_HOST_INTERNO>:5432/vocero` |
| `BETTER_AUTH_SECRET` | Mínimo 16 caracteres. `openssl rand -base64 32` |
| `ENCRYPTION_KEY` | **32 bytes en base64**. `openssl rand -base64 32` |
| `META_WEBHOOK_VERIFY_TOKEN` | Mínimo 8 caracteres, a elección del dueño |

> **`DATABASE_URL` apunta al hostname INTERNO.** Ni `localhost`, ni una IP
> pública, ni `127.0.0.1`. Y el usuario es **`cadit_app`**, no `postgres`:
> conectarse como `postgres` desactiva el filtrado entre organizaciones sin
> avisar.
>
> **`ENCRYPTION_KEY` debe ser la MISMA que la del origen** si la base trae
> credenciales de Meta cifradas. Con otra clave, esos secretos quedan
> ilegibles. (Hoy `meta_credentials` tiene **0 filas**, así que en esta
> migración puntual se puede generar una nueva sin perder nada.)

**Opcionales** — si faltan, la app arranca igual y esa función queda apagada:

`META_APP_SECRET` · `META_GRAPH_API_VERSION` (def. `v25.0`) ·
`META_GRAPH_BASE_URL` · `OPENROUTER_API_TOKEN` · `OPENROUTER_BASE_URL` ·
`OPENROUTER_MODEL` · `OPENROUTER_JUDGE_MODEL` · `ALLOW_SIGNUP` ·
`AGENT_COALESCE_MS` (def. `6000`) · `BOT_API_KEY` · `PUBLIC_CORS_ORIGINS` ·
`M365_TENANT_ID` · `M365_CLIENT_ID` · `M365_CLIENT_SECRET` · `M365_SENDER` ·
`M365_BCC` · `PUBLIC_FORM_RATE_LIMIT` · `PUBLIC_FORM_RATE_WINDOW_MS`

**Dos que importan y se pasan por alto:**

- **`MEDIA_DIR=/data/media`** — sin esto toma el default `./.dev-media`, que en
  el contenedor es efímero: **los adjuntos se pierden en cada deploy**. El
  `Dockerfile` ya prepara `/data/media` con el dueño correcto; hay que montarle
  un **volumen persistente** en Coolify.
- **`WA_MOCK_ENABLED` NO se define en producción.** Nunca.

### 9. Cerrar el túnel

Terminada la carga, cerrar la sesión SSH del paso 3 (Ctrl-C). El túnel es para
la migración, no para operar.

---

## Verificación

**Nada de esto es opcional.** Con el túnel abierto y antes de dar el deploy por
bueno.

### A. Conteo de filas, origen contra destino

```bash
CNT="select c.relname || '|' || (xpath('/row/cnt/text()',
  query_to_xml(format('select count(*) as cnt from public.%I', c.relname),
  false, true, '')))[1]::text::bigint
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' order by c.relname;"

PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 -U postgres \
  -d vocero -tA -c "$CNT" > destino-conteos.txt

diff origen-conteos.txt destino-conteos.txt && echo "IDÉNTICOS"
```

Referencia del origen al 2026-09-09 — **43 tablas**, las que importan:

| Tabla | Filas |
|---|---|
| `contact` | 341 |
| `enrollment` | 384 |
| `cohort` | 42 |
| `course` | 35 |
| `organization` | **1** |
| `user` | 9 |
| `member` | 5 |
| `teacher` | 8 |
| `account_link` | 4 |
| `class_session` | 22 |
| `session` | 116 |

### B. Migraciones

```sql
select count(*) as total, max(id) as ultimo from drizzle.__drizzle_migrations;
```

**Antes** del paso 7 → `38`. **Después** → `39`.

```sql
select column_name from information_schema.columns
where table_name = 'course' and column_name = 'grants_certificate';
```

Después del paso 7 tiene que devolver una fila.

### C. Políticas RLS presentes

```sql
select count(*) from pg_policies where schemaname = 'public';
-- esperado: 33

select count(*) from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity;
-- esperado: 33
```

Y para comparar tabla por tabla contra el origen:

```sql
select tablename, policyname from pg_policies
where schemaname = 'public' order by tablename;
```

Las 33 tablas de dominio con `tenant_isolation`. Las que quedan **fuera a
propósito** (no son un error): `member`, `account_link`, `role`, `invitation`,
`meta_credentials`, `organization`, y las de Better Auth (`user`, `session`,
`account`, `verification`).

### D. La prueba que de verdad importa

Conectarse **como `cadit_app`**, sin declarar organización. Tiene que ver
**cero filas**. Si ve filas, el aislamiento está roto y **el deploy no va**.

```bash
PGPASSWORD='<CADIT_APP_PASSWORD>' psql -h 127.0.0.1 -p 15432 -U cadit_app \
  -d vocero -tA <<'SQL'
select 'contact='    || count(*) from contact;
select 'enrollment=' || count(*) from enrollment;
select 'cohort='     || count(*) from cohort;
SQL
```

**Esperado — y esto es el criterio de aceptación:**

```
contact=0
enrollment=0
cohort=0
```

> **Si devuelve 341 / 384 / 42, PARÁ.** Significa que `cadit_app` está
> salteando RLS. Las tres causas posibles, en orden:
> es dueño de las tablas (faltó `--no-owner`), es superusuario, o tiene
> `bypassrls`. El chequeo E las descarta.

Y con la organización declarada tiene que ver **todo**:

```bash
PGPASSWORD='<CADIT_APP_PASSWORD>' psql -h 127.0.0.1 -p 15432 -U cadit_app \
  -d vocero -tA <<'SQL'
set app.current_org = (select id from organization limit 1);
SQL
```

`set` no acepta subconsulta, así que en dos pasos:

```bash
ORG=$(PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 \
  -U postgres -d vocero -tAc "select id from organization limit 1;")

PGPASSWORD='<CADIT_APP_PASSWORD>' psql -h 127.0.0.1 -p 15432 -U cadit_app \
  -d vocero -tA <<SQL
set app.current_org = '$ORG';
select 'contact='    || count(*) from contact;
select 'enrollment=' || count(*) from enrollment;
select 'cohort='     || count(*) from cohort;
SQL
```

Esperado: `341` / `384` / `42`. **Los dos resultados juntos** —cero sin
organización, todo con ella— son la prueba de que RLS filtra y de que los datos
llegaron completos.

### E. `cadit_app` no tiene los privilegios que saltean RLS

```sql
select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
from pg_roles where rolname = 'cadit_app';
-- esperado: f | f | f | f

select count(*) from pg_tables
where schemaname = 'public' and tableowner = 'cadit_app';
-- esperado: 0
```

Las tres puertas para saltear RLS —ser dueño, ser superusuario, tener
`bypassrls`— tienen que estar las tres cerradas. Cerrar dos no sirve de nada.

### F. La app, ya desplegada

```bash
curl -fsS https://<APP_BASE_URL>/api/health
```

Y en los logs del contenedor, la línea que confirma que el arranque pasó por
las migraciones sin romperse:

```
[migrate] migraciones aplicadas
```

Si en cambio aparecen `[migrate] BD no lista (intento N/15)` repetidos y después
`permission denied for database vocero`: **faltan los GRANT del paso 6.**
Si aparece `must be owner of table <tabla>`: **hay una migración pendiente que
hay que aplicar a mano como `postgres`** (paso 7).

---

## Cómo volver atrás

Ordenado de menos a más drástico.

### La app no arranca pero la base está bien

No tocar la base. Mirar los logs y comparar con la tabla del chequeo F: casi
siempre es el paso 6 o el 7.

### El restore salió mal (errores de GRANT, datos incompletos)

Rehacer la base entera. Todavía no hay nada que perder: el origen está intacto.

```bash
PGPASSWORD='<PG_PASSWORD_COOLIFY>' psql -h 127.0.0.1 -p 15432 -U postgres \
  -d postgres -v ON_ERROR_STOP=1 <<'SQL'
drop database vocero;
create database vocero;
grant connect on database vocero to cadit_app;
SQL
```

Y volver al **paso 5** (el rol `cadit_app` ya existe; sobrevive al `drop
database` porque es del cluster).

### `cadit_app` ve filas sin declarar organización

**No desplegar.** Es lo único que este runbook trata como bloqueante duro.
Correr el chequeo E para saber cuál de las tres puertas quedó abierta, y rehacer
el restore con `--no-owner`.

### Ya hay tráfico real y algo falla en producción

La salida rápida, la misma que documenta `rls-rol-de-conexion.md`: apuntar
`DATABASE_URL` a `postgres` en vez de `cadit_app`. La app vuelve a funcionar de
inmediato **y se queda sin filtrado entre organizaciones**.

Con una sola organización cargada el riesgo práctico hoy es bajo, pero es una
medida **temporal**: hay que volver a `cadit_app` apenas se resuelva la causa.

### Volver a la base local

El origen nunca se tocó: sigue siendo la referencia. Ningún paso de este
runbook escribe en `vocero-dev-postgres-1`.

---

## Qué se verificó de verdad

Todo lo de abajo se probó el **2026-09-09** contra un contenedor
`postgres:16-alpine` **efímero y aislado**, restaurado desde el dump real. No se
escribió una sola vez en la base local.

| Verificado | Resultado |
|---|---|
| Estado del origen: 38 migraciones, `grants_certificate` ausente | ✅ |
| El dump lleva 33 POLICY + 33 ROW SECURITY + 46 ACL + 44 TABLE DATA | ✅ |
| Restaurar sin el rol → 46 errores **y exit code 0** | ✅ confirmado |
| Restaurar con el rol creado antes → `--exit-on-error`, exit 0 limpio | ✅ |
| Conteos idénticos en las **43** tablas | ✅ |
| 33 políticas y 33 tablas con RLS en el destino | ✅ |
| `cadit_app` sin organización → **0 filas** | ✅ |
| `cadit_app` con organización → 341 / 384 / 42 | ✅ |
| `migrate.mjs` como `cadit_app` → falla aun con 0 pendientes | ✅ confirmado |
| Los tres GRANT del paso 6 lo destraban sin romper RLS | ✅ |
| `migrate.mjs` como `postgres` → aplica la 0038, deja 39 | ✅ |
| Una DDL pendiente como `cadit_app` → `must be owner of table` | ✅ |

**Lo que NO se pudo probar**, por falta de acceso:

- El panel de Coolify y la creación real del servicio.
- El túnel SSH contra el host real.
- El `pg_restore` contra el destino real.
- El healthcheck de la app desplegada.

Los pasos 1, 3, 5 (contra el destino), 8 y el chequeo F **están escritos pero no
ejecutados**. El resto de la mecánica —la parte que suele fallar— sí se probó
end-to-end sobre una copia fiel.
