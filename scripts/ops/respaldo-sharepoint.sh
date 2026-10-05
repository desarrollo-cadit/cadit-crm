#!/bin/sh
# Respaldo diario de la base de producción, con copia fuera del servidor.
#
# Corre en el HOST de Coolify (no en un contenedor), desde cron. Hace el
# volcado con el pg_dump del propio contenedor de Postgres, lo VERIFICA, lo
# guarda en el disco del host y lo sube con rclone a una biblioteca de
# SharePoint. Guía completa, permisos y restauración: docs/respaldos.md.
#
# Por qué no los respaldos programados de Coolify: dependeríamos de rutas
# internas de Coolify que cambian entre versiones, y un cambio silencioso de
# ruta deja de subir respaldos sin que nadie se entere.

set -eu

: "${DB_CONTAINER:?Falta DB_CONTAINER: nombre del contenedor de Postgres (docker ps)}"
: "${REMOTE:?Falta REMOTE: destino de rclone, p. ej. sharepoint:Respaldos/campus}"
DB_NAME="${DB_NAME:-vocero}"
LOCAL_DIR="${LOCAL_DIR:-/var/backups/cadit}"
LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-14}"
REMOTE_KEEP_DAYS="${REMOTE_KEEP_DAYS:-90}"

log() { printf '%s [respaldo] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

stamp=$(date -u +%Y%m%d-%H%M%SZ)
file="$LOCAL_DIR/$DB_NAME-$stamp.dump"
partial="$file.partial"

mkdir -p "$LOCAL_DIR"
chmod 700 "$LOCAL_DIR"
umask 077
trap 'rm -f "$partial"' EXIT

log "volcando $DB_NAME desde $DB_CONTAINER"
# Dentro del contenedor, psql/pg_dump entran por socket local sin contraseña:
# la clave del superusuario no tiene que vivir en este host.
docker exec "$DB_CONTAINER" pg_dump -U postgres -d "$DB_NAME" -Fc > "$partial"

# Un respaldo vacío que dice "OK" es peor que ninguno: invita a confiar en él.
# Se exige que el archivo sea un volcado legible Y que traiga datos de tablas.
tablas=$(docker exec -i "$DB_CONTAINER" pg_restore --list < "$partial" | grep -c 'TABLE DATA' || true)
if [ "$tablas" -lt 1 ]; then
  log "ERROR: el volcado no tiene datos de tablas ($tablas); no se sube"
  exit 1
fi

mv "$partial" "$file"
log "volcado verificado: $tablas tablas con datos, $(wc -c < "$file") bytes"

rclone copy "$file" "$REMOTE/"
log "subido a $REMOTE"

# Testigo visible para cualquiera con acceso al sitio: si la fecha de este
# archivo no es de hoy, los respaldos dejaron de correr.
printf 'Último respaldo correcto: %s\nArchivo: %s\nTablas con datos: %s\n' \
  "$stamp" "$(basename "$file")" "$tablas" | rclone rcat "$REMOTE/ULTIMO-RESPALDO-OK.txt"

# Retención. Va al final, a propósito: nunca se borra un respaldo viejo si el
# de hoy no llegó a destino.
find "$LOCAL_DIR" -name '*.dump' -type f -mtime +"$LOCAL_KEEP_DAYS" -delete
rclone delete "$REMOTE" --include '*.dump' --min-age "${REMOTE_KEEP_DAYS}d"
log "listo"
