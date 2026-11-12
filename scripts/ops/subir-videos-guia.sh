#!/usr/bin/env bash
# Sube los tutoriales en video de la guía al volumen persistente de la app (el de los adjuntos).
#
#   CADIT_SSH=root@mi-servidor \
#   SERVER_DIR=/var/lib/docker/volumes/<volumen-de-adjuntos>/_data/guia-videos \
#   bash scripts/ops/subir-videos-guia.sh
#
# La app lee los videos de <MEDIA_DIR>/guia-videos (MEDIA_DIR = /data/media, ya montado en
# producción), así que NO hace falta configurar nada en Coolify ni redeployar para publicar o
# actualizar un video. Para saber <volumen-de-adjuntos>: en el servidor,
#   docker inspect <contenedor-de-la-app> --format '{{range .Mounts}}{{.Name}} {{.Destination}}{{println}}{{end}}'
# y tomar el volumen cuyo destino es /data/media.
#
# Qué hace (se detiene ante el primer error):
#   1. Comprueba que demos-output/guia/publicar tenga los .mp4 y las portadas .jpg.
#   2. Crea la carpeta del servidor y copia los archivos por SSH (tar, sin depender de rsync).
#   3. Deja los archivos con el dueño del usuario de la app (el contenedor no corre como root).
#   4. Cuenta lo que quedó subido.
#
# Solo escribe en SERVER_DIR: no toca la app, la base ni Coolify. Es idempotente: volver a
# correrlo reemplaza los videos (así se actualiza uno).
#
# Variables:
#   CADIT_SSH      usuario@host del servidor de Coolify (OBLIGATORIA)
#   SERVER_DIR     carpeta destino en el servidor, dentro del volumen de adjuntos (OBLIGATORIA)
#   CADIT_SSH_KEY  ruta a la clave privada (opcional; si no, la de ssh)
#   OWNER          uid:gid del usuario de la app (por defecto 100:101, el usuario `vocero`)
#   ORIGEN         demos-output/guia/publicar
set -euo pipefail
: "${CADIT_SSH:=}"
: "${SERVER_DIR:=}"
OWNER="${OWNER:-100:101}"
ORIGEN="${ORIGEN:-demos-output/guia/publicar}"
log() { printf '[videos] %s\n' "$*"; }
falla() { printf '[videos] ERROR: %s\n' "$*" >&2; exit 1; }

[[ -n "$CADIT_SSH" ]] || falla "defina CADIT_SSH=usuario@host (el servidor de Coolify)."
[[ -n "$SERVER_DIR" ]] || falla "defina SERVER_DIR (la carpeta guia-videos dentro del volumen de adjuntos; ver el encabezado)."
[[ "$SERVER_DIR" =~ ^/[A-Za-z0-9_./-]+/guia-videos$ ]] || falla "SERVER_DIR debe ser una ruta absoluta que termine en /guia-videos."
[[ "$OWNER" =~ ^[0-9]+:[0-9]+$ ]] || falla "OWNER debe ser uid:gid numéricos."

# ---------------------------------------------------------------- 1. origen
[[ -d "$ORIGEN" ]] || falla "no existe $ORIGEN (corra node scripts/demos/guia/publicar.mjs)."
mp4=$(find "$ORIGEN" -maxdepth 1 -name '*.mp4' | wc -l | tr -d ' ')
jpg=$(find "$ORIGEN" -maxdepth 1 -name '*.jpg' | wc -l | tr -d ' ')
[[ "$mp4" -gt 0 ]] || falla "$ORIGEN no tiene videos."
[[ "$mp4" -eq "$jpg" ]] || falla "hay $mp4 videos y $jpg portadas: deben ser iguales."
log "origen: $mp4 videos y $jpg portadas en $ORIGEN ($(du -sh "$ORIGEN" | cut -f1))"

SSH=(ssh -o BatchMode=yes)
[[ -n "${CADIT_SSH_KEY:-}" ]] && SSH+=(-i "$CADIT_SSH_KEY")

# ------------------------------------------------------------ 2. copiar
log "copiando a $CADIT_SSH:$SERVER_DIR …"
tar -C "$ORIGEN" -cf - . | "${SSH[@]}" "$CADIT_SSH" "mkdir -p '$SERVER_DIR' && tar -C '$SERVER_DIR' -xf -"

# ---------------------------------------------------------- 3. permisos
"${SSH[@]}" "$CADIT_SSH" "chown -R $OWNER '$SERVER_DIR' && chmod -R a+rX '$SERVER_DIR'"

# ------------------------------------------------------------ 4. control
remoto=$("${SSH[@]}" "$CADIT_SSH" "find '$SERVER_DIR' -maxdepth 1 -name '*.mp4' | wc -l" | tr -d ' ')
log "en el servidor: $remoto videos en $SERVER_DIR"
[[ "$remoto" -ge "$mp4" ]] || falla "faltan videos en el servidor."
log "listo. Los videos se ven en /guia sin más cambios."
