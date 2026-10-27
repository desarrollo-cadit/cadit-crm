#!/usr/bin/env bash
# Copia el último respaldo de producción a una base APARTE del Docker local,
# para probar con datos reales sin tocar producción ni la base de desarrollo.
#
#   CADIT_SSH=root@mi-servidor bash scripts/ops/copiar-produccion-a-local.sh
#
# Qué hace, en orden (se detiene ante el primer error):
#   1. Revisa que el .env local NO pueda mandar correos ni WhatsApp reales.
#   2. Trae por SSH el .dump más reciente de /var/backups/cadit (ver docs/respaldos.md).
#   3. Verifica que el volcado traiga datos de tablas.
#   4. Borra y recrea la base de la copia (por defecto `cadit_copia`).
#   5. Restaura con --exit-on-error (sin ese flag pg_restore falla en silencio).
#   6. Aplica, como `postgres`, las migraciones que producción todavía no tiene.
#   7. Muestra los conteos y la DATABASE_URL para apuntar la app a la copia.
#
# Nunca escribe en producción: por SSH solo lista y copia un archivo.
#
# Variables (con su valor por defecto):
#   CADIT_SSH          usuario@host del servidor de Coolify (OBLIGATORIA)
#   CADIT_SSH_KEY      ruta a la clave privada (opcional; si no, la de ssh)
#   REMOTE_DIR         /var/backups/cadit
#   LOCAL_CONTAINER    vocero-dev-postgres-1
#   LOCAL_PORT         5433
#   POSTGRES_PASSWORD  postgres (la del docker-compose.dev.yml)
#   COPY_DB            cadit_copia
#   DUMPS_DIR          .respaldos (está en .gitignore: son datos personales)
#   DUMP_FILE          si se define, usa ese .dump local y no se conecta por SSH
set -euo pipefail

: "${CADIT_SSH:=}"
REMOTE_DIR="${REMOTE_DIR:-/var/backups/cadit}"
LOCAL_CONTAINER="${LOCAL_CONTAINER:-vocero-dev-postgres-1}"
LOCAL_PORT="${LOCAL_PORT:-5433}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
COPY_DB="${COPY_DB:-cadit_copia}"
DUMPS_DIR="${DUMPS_DIR:-.respaldos}"
DUMP_FILE="${DUMP_FILE:-}"

log() { printf '[copia] %s\n' "$*"; }
falla() { printf '[copia] ERROR: %s\n' "$*" >&2; exit 1; }

# La base se llama distinto que la de desarrollo y que producción, a propósito.
case "$COPY_DB" in
  vocero|postgres|template0|template1) falla "COPY_DB='$COPY_DB' no está permitido: usá un nombre propio para la copia." ;;
esac
[[ "$COPY_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || falla "COPY_DB solo admite minúsculas, números y _."

# ---------------------------------------------------------------- 1. .env
# Con datos reales, un correo o un WhatsApp de prueba le llegaría a una persona
# de verdad. Si el .env local puede mandar cualquiera de los dos, no seguimos.
if [[ -f .env ]]; then
  valor() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '"'"'"' \r'; }
  tiene() { local v; v="$(valor "$1")"; [[ -n "$v" && "$v" != REEMPLAZA_* ]]; }
  if tiene M365_CLIENT_SECRET || tiene M365_SENDER; then
    falla "el .env local tiene credenciales de correo (M365_*). Vacialas antes de usar datos reales."
  fi
  if [[ "$(valor WA_MOCK_ENABLED)" != "true" ]]; then
    falla "WA_MOCK_ENABLED no es 'true' en el .env local: WhatsApp podría salir a contactos reales."
  fi
  if tiene META_GRAPH_BASE_URL && [[ "$(valor META_GRAPH_BASE_URL)" != *"/api/dev/"* ]]; then
    falla "META_GRAPH_BASE_URL no apunta al wa-mock local."
  fi
else
  log "aviso: no hay .env en esta carpeta; revisá a mano que no haya credenciales reales."
fi

command -v docker >/dev/null || falla "no encuentro docker."
docker exec "$LOCAL_CONTAINER" pg_isready -U postgres >/dev/null 2>&1 \
  || falla "el contenedor $LOCAL_CONTAINER no responde. Levantalo: docker compose -f docker-compose.dev.yml up -d"

# ---------------------------------------------------------------- 2. traer
mkdir -p "$DUMPS_DIR"
if [[ -z "$DUMP_FILE" ]]; then
  [[ -n "$CADIT_SSH" ]] || falla "falta CADIT_SSH (por ejemplo root@mi-servidor)."
  ssh_opts=(-o BatchMode=yes -o ConnectTimeout=15)
  [[ -n "${CADIT_SSH_KEY:-}" ]] && ssh_opts+=(-i "$CADIT_SSH_KEY")
  remoto="$(ssh "${ssh_opts[@]}" "$CADIT_SSH" "ls -1t '$REMOTE_DIR'/*.dump 2>/dev/null | head -n1")" \
    || falla "no pude conectarme por SSH a $CADIT_SSH."
  [[ -n "$remoto" ]] || falla "no hay respaldos .dump en $REMOTE_DIR del servidor."
  DUMP_FILE="$DUMPS_DIR/$(basename "$remoto")"
  if [[ -s "$DUMP_FILE" ]]; then
    log "ya tenía $(basename "$remoto"), no lo vuelvo a bajar."
  else
    log "trayendo $(basename "$remoto")…"
    scp "${ssh_opts[@]}" "$CADIT_SSH:$remoto" "$DUMP_FILE.partial" || falla "falló la copia por SSH."
    mv "$DUMP_FILE.partial" "$DUMP_FILE"
  fi
fi
[[ -s "$DUMP_FILE" ]] || falla "no existe o está vacío: $DUMP_FILE"

# ---------------------------------------------------------------- 3. verificar
tablas="$(docker exec -i "$LOCAL_CONTAINER" pg_restore --list < "$DUMP_FILE" | grep -c 'TABLE DATA' || true)"
[[ "$tablas" -gt 0 ]] || falla "el volcado no trae datos de tablas."
log "volcado válido: $tablas tablas con datos."

# ---------------------------------------------------------------- 4. recrear
psql_local() { docker exec -i "$LOCAL_CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
# `cadit_app` es del cluster: no viaja en el volcado y tiene que existir ANTES.
psql_local -d postgres -tAc "select 1 from pg_roles where rolname = 'cadit_app'" | grep -q 1 \
  || falla "no existe el rol cadit_app en el Postgres local (ver docs/rls-rol-de-conexion.md)."
log "recreando la base $COPY_DB…"
psql_local -d postgres -c "drop database if exists $COPY_DB with (force);" >/dev/null
psql_local -d postgres -c "create database $COPY_DB;" >/dev/null
psql_local -d postgres -c "grant connect on database $COPY_DB to cadit_app;" >/dev/null

# ---------------------------------------------------------------- 5. restaurar
log "restaurando (puede tardar un poco)…"
docker exec -i "$LOCAL_CONTAINER" pg_restore -U postgres -d "$COPY_DB" \
  --no-owner --role=postgres --exit-on-error < "$DUMP_FILE" \
  || falla "pg_restore falló; la copia quedó incompleta. Volvé a correr el script."

# Los mismos GRANT de replica-base-coolify.md (paso 6): no debilitan RLS.
psql_local -d "$COPY_DB" >/dev/null <<SQL
grant create on database $COPY_DB to cadit_app;
grant usage, create on schema drizzle to cadit_app;
grant select, insert on all tables in schema drizzle to cadit_app;
SQL

# ---------------------------------------------------------------- 6. migrar
# Como postgres: cadit_app no puede aplicar DDL (replica-base-coolify.md, punto 4).
log "aplicando las migraciones que producción todavía no tiene…"
DATABASE_URL="postgresql://postgres:$POSTGRES_PASSWORD@127.0.0.1:$LOCAL_PORT/$COPY_DB" \
MIGRATIONS_DIR="$PWD/drizzle" \
  node scripts/migrate.mjs

# ---------------------------------------------------------------- 7. resumen
psql_local -d "$COPY_DB" -tA <<'SQL'
select 'contactos:     ' || count(*) from contact;
select 'inscripciones: ' || count(*) from enrollment;
select 'grupos:        ' || count(*) from cohort;
select 'clases:        ' || count(*) from class_session;
select 'migraciones:   ' || count(*) from drizzle.__drizzle_migrations;
SQL

cat <<EOF

[copia] Listo. Para usar la copia, en tu .env local:
  DATABASE_URL=postgresql://cadit_app:<CONTRASEÑA_LOCAL_DE_CADIT_APP>@localhost:$LOCAL_PORT/$COPY_DB
y reiniciá 'pnpm dev'. Para volver a tu base de siempre, poné de nuevo /vocero.

Recordá: las credenciales guardadas (Zoom, WhatsApp) están cifradas con la clave
de producción y en local no se leen. Para probar Zoom, cargalas de nuevo en
Configuración → Zoom. La copia tiene datos personales: no la compartas.
EOF
