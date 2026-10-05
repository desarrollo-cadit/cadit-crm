# Respaldos de la base de producción

Un respaldo diario de PostgreSQL, verificado, con una copia en el disco del
servidor y otra en una biblioteca de SharePoint de la empresa.

| | Dónde | Cuánto se guarda |
|---|---|---|
| Copia rápida | Host de Coolify, `/var/backups/cadit` | 14 días |
| Copia fuera del servidor | SharePoint, `Respaldos/campus` | 90 días |

El script es `scripts/ops/respaldo-sharepoint.sh`. Corre en el **host** (no en
un contenedor) desde cron.

## Qué garantiza y qué no

**Garantiza:**

- **No sube un respaldo vacío.** Antes de subirlo, el script lee el volcado con
  `pg_restore --list` y exige que traiga datos de tablas. Si no, sale con error.
- **Nunca borra respaldos viejos si el de hoy falló.** La retención corre al
  final, después de que el respaldo nuevo llegó a SharePoint.
- **Avisa si deja de correr**, de una forma que ve cualquiera con acceso al
  sitio: el archivo `ULTIMO-RESPALDO-OK.txt` lleva la fecha del último respaldo
  correcto. **Si esa fecha no es de hoy o de ayer, algo se rompió.**

**No garantiza:**

- Que nadie mire. Si nadie abre `ULTIMO-RESPALDO-OK.txt`, un respaldo roto pasa
  desapercibido igual. Ver [Revisión mensual](#revisión-mensual).
- Recuperar lo que pasó entre un respaldo y el siguiente. Con un respaldo por
  día se puede perder, como mucho, un día de trabajo.

Probado el 2026-10-05 contra la base local: el volcado restaurado da
341 contactos, 384 inscripciones, 45 cohortes y 44 políticas RLS, idénticos al
origen. Probados también los caminos de error (contenedor equivocado, base
inexistente, falla de la subida y variable faltante): en los cuatro sale con
error, no deja el testigo de "OK" y no borra nada.

## Por qué así

- **Por qué SharePoint:** los datos quedan dentro del tenant de la empresa, que
  ya paga ese almacenamiento, y no se suma un proveedor nuevo.
- **Por qué SharePoint y no OneDrive:** un OneDrive es de una persona. Si esa
  persona deja la empresa y se borra su cuenta, se van los respaldos con ella.
- **Por qué una app de Entra ID aparte de la del correo:** la del correo tiene
  `Mail.Send` y su secreto vive en el contenedor de la aplicación. Si fueran la
  misma, una filtración de ese secreto también abriría los respaldos, que tienen
  los datos personales de todos los alumnos. Separadas, cada secreto abre una
  sola puerta.
- **Por qué `Sites.Selected`:** es el único permiso de SharePoint que se puede
  acotar a **un** sitio. `Sites.ReadWrite.All` le daría acceso a todos los
  sitios de la empresa.
- **Por qué un `pg_dump` propio y no los respaldos programados de Coolify:** así
  no dependemos de las rutas internas de Coolify, que cambian entre versiones.
  Un cambio silencioso de ruta haría que se dejaran de subir respaldos sin que
  nadie se entere.

---

## Puesta en marcha

Se hace una sola vez. Los valores entre `<ASÍ>` los provee el dueño, y **nunca**
se pegan en un chat, un commit, un ticket ni un log.

| Marcador | Qué es |
|---|---|
| `<TENANT_ID>` | Id del directorio de Entra ID (el mismo que `M365_TENANT_ID`) |
| `<CLIENT_ID>` | Id de la app **nueva** `cadit-respaldos` |
| `<CLIENT_SECRET>` | Secreto de la app **nueva** |
| `<DOMINIO>` | El de SharePoint, p. ej. `cadit` en `cadit.sharepoint.com` |
| `<SITIO>` | El nombre del sitio en la URL, p. ej. `Direccion` en `/sites/Direccion` |
| `<SITE_ID>` | Lo devuelve el paso 2 |
| `<DRIVE_ID>` | Lo devuelve el paso 3 (empieza con `b!`) |

### 1. Registrar la app en Entra ID

1. [entra.microsoft.com](https://entra.microsoft.com) → **App registrations** →
   **New registration**.
2. Nombre: `cadit-respaldos`. Tipo de cuenta: **Single tenant**. Sin redirect
   URI.
3. Anotá el **Application (client) ID** → `<CLIENT_ID>`.
4. **Certificates & secrets** → **New client secret**, con 24 meses de
   vencimiento. Copiá el **Value** (no el Secret ID) → `<CLIENT_SECRET>`.
   **Agendá la fecha de vencimiento**: cuando venza, los respaldos fallan.
5. **API permissions** → **Add a permission** → **Microsoft Graph** →
   **Application permissions** → **`Sites.Selected`**.
6. **Grant admin consent**. Sin este paso el permiso figura pero no funciona.

Con esto la app todavía **no puede entrar a ningún sitio**: `Sites.Selected`
empieza vacío. El paso 2 le habilita uno.

### 2. Habilitarle el sitio (y solo ese)

Lo hace un administrador del tenant desde
[Graph Explorer](https://developer.microsoft.com/graph/graph-explorer), con su
propia cuenta. Si lo pide, hay que dar consentimiento a
`Sites.FullControl.All` (pestaña **Modify permissions**). Ese permiso es de la
sesión del administrador en Graph Explorer, **no** de la app.

**a. Obtener el id del sitio** (GET):

```
https://graph.microsoft.com/v1.0/sites/<DOMINIO>.sharepoint.com:/sites/<SITIO>
```

El campo `id` de la respuesta → `<SITE_ID>`.

**b. Darle permiso de escritura a la app** (POST):

```
https://graph.microsoft.com/v1.0/sites/<SITE_ID>/permissions
```

Cuerpo:

```json
{
  "roles": ["write"],
  "grantedToIdentities": [
    { "application": { "id": "<CLIENT_ID>", "displayName": "cadit-respaldos" } }
  ]
}
```

Tiene que responder `201 Created`.

### 3. Obtener el id de la biblioteca

En Graph Explorer (GET):

```
https://graph.microsoft.com/v1.0/sites/<SITE_ID>/drives
```

Buscá la biblioteca donde van a ir los respaldos (normalmente **Documentos** o
**Shared Documents**). Su `id` → `<DRIVE_ID>`.

### 4. Crear la carpeta y restringirla

En SharePoint, dentro de esa biblioteca, creá `Respaldos/campus`.

**Restringí quién la ve.** Cada respaldo es la base entera: nombres, cédulas,
teléfonos, notas y estado de cuenta de todos los alumnos. Que lo vea solo
dirección: carpeta → **Administrar acceso** → dejar de heredar permisos.

### 5. Instalar y configurar rclone en el host

Por SSH al host de Coolify, como `root`:

```bash
curl -fsSL https://rclone.org/install.sh | bash
rclone version   # 1.62 o mayor: antes no existía client_credentials
```

Creá `/root/.config/rclone/rclone.conf`:

```ini
[sharepoint]
type = onedrive
client_id = <CLIENT_ID>
client_secret = <CLIENT_SECRET>
tenant = <TENANT_ID>
client_credentials = true
drive_type = documentLibrary
drive_id = <DRIVE_ID>
```

```bash
chmod 600 /root/.config/rclone/rclone.conf
rclone lsd sharepoint:Respaldos   # tiene que listar "campus"
```

Si `lsd` da `403` o `accessDenied`, falta el paso 2 o el consentimiento del
paso 1.6. Si da `itemNotFound`, el `<DRIVE_ID>` es de otra biblioteca.

### 6. Instalar el script y correrlo a mano

Desde tu máquina, en la raíz del repo:

```bash
scp scripts/ops/respaldo-sharepoint.sh root@<HOST>:/opt/cadit/respaldo-sharepoint.sh
```

En el host:

```bash
chmod 700 /opt/cadit/respaldo-sharepoint.sh
docker ps --format '{{.Names}}' | grep -i postgres   # nombre del contenedor
```

El contenedor de la base de Coolify se llama como su uuid
(`qkzop8ox5iqdmtjnajqrqwr2` al 2026-09-10). **Confirmalo con `docker ps`**: si
se recrea el servicio, el nombre cambia.

```bash
DB_CONTAINER=<CONTENEDOR> REMOTE=sharepoint:Respaldos/campus \
  /opt/cadit/respaldo-sharepoint.sh
```

Tiene que terminar en `listo`. Después, en SharePoint tienen que aparecer el
`.dump` y `ULTIMO-RESPALDO-OK.txt`.

### 7. Programarlo

Mirá en qué zona horaria está el host:

```bash
date
```

Creá `/etc/cron.d/cadit-respaldo`. Si el host está en UTC, `0 6` son las 03:00
de Montevideo:

```cron
DB_CONTAINER=<CONTENEDOR>
REMOTE=sharepoint:Respaldos/campus
RCLONE_CONFIG=/root/.config/rclone/rclone.conf
0 6 * * * root flock -n /run/cadit-respaldo.lock /opt/cadit/respaldo-sharepoint.sh >> /var/log/cadit-respaldo.log 2>&1
```

El archivo tiene que tener permisos `644` y terminar con un salto de línea:
cron ignora en silencio la última línea si no lo tiene.

> **La terminal web del VPS corrompe los pegados largos** (pasó dos veces el
> 2026-10-05: mezcló y duplicó tramos). Crear archivos de a una línea con
> `echo '...' >> archivo`, y copiar el script con `scp` desde la PC — nunca
> pegarlo. Después de copiarlo, comparar `sha256sum` contra el del repo.

`flock` evita que dos corridas se pisen si una se cuelga.

**Al día siguiente**, confirmá que corrió solo:

```bash
tail -5 /var/log/cadit-respaldo.log
```

---

## Restaurar

Hay dos trampas que ya están documentadas en
[`replica-base-coolify.md`](./replica-base-coolify.md), y que valen igual acá:

1. **El rol `cadit_app` no viaja en el volcado.** Hay que crearlo **antes** de
   restaurar.
2. **`pg_restore` sin `--exit-on-error` sale con `0` aunque fallen los
   GRANT.** Siempre con ese flag.

### Probar un respaldo (sin tocar producción)

En una máquina con Docker, sobre una base descartable:

```bash
# descargá el .dump desde SharePoint, después:
docker exec vocero-dev-postgres-1 psql -U postgres -c "create database respaldo_prueba;"
docker exec -i vocero-dev-postgres-1 pg_restore -U postgres -d respaldo_prueba \
  --exit-on-error --no-owner --role=postgres < vocero-AAAAMMDD-HHMMSSZ.dump
docker exec vocero-dev-postgres-1 psql -U postgres -d respaldo_prueba -tAc \
  "select (select count(*) from contact), (select count(*) from enrollment), (select count(*) from pg_policies);"
docker exec vocero-dev-postgres-1 psql -U postgres -c "drop database respaldo_prueba with (force);"
```

En la base local el rol `cadit_app` ya existe. En un servidor nuevo, crealo
primero (paso 4 de `replica-base-coolify.md`).

### Restaurar producción

Es la misma secuencia que la réplica original: crear el rol, restaurar con
`--exit-on-error`, aplicar los GRANT y verificar. Seguí
[`replica-base-coolify.md`](./replica-base-coolify.md) desde el paso 4, usando el
`.dump` del respaldo en lugar de un volcado nuevo.

---

## Revisión mensual

Un respaldo que nunca se restauró es una suposición. Una vez por mes:

1. Abrí `ULTIMO-RESPALDO-OK.txt` en SharePoint: la fecha tiene que ser de hoy o
   de ayer.
2. Bajá el `.dump` más reciente y hacé [Probar un respaldo](#probar-un-respaldo-sin-tocar-producción).
   Los conteos tienen que parecerse a los de producción.

## Cuando vence el secreto

Mismo procedimiento que el del correo (`correo-microsoft-365.md`, "Rotar el
secreto"): creá el nuevo **antes** de borrar el viejo, cambiá `client_secret` en
`/root/.config/rclone/rclone.conf`, corré el script a mano una vez y recién
después borrá el viejo en Entra ID.
