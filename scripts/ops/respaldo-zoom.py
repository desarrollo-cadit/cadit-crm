#!/usr/bin/env python3
"""Respaldo de las grabaciones en la nube de TODAS las cuentas de Zoom a SharePoint.

Corre en el HOST de Coolify (no en un contenedor), desde cron, una vez por mes.
Está FUERA del CRM a propósito: la constitución (1.6.0 / 1.7.0) prohíbe que el
servidor del CRM descargue o guarde video. Este programa solo LEE del CRM las
conexiones de Zoom ya cargadas en /settings/zoom.

Garantías (son el contrato; no aflojarlas):
  - MERGE: sube solo los archivos que todavía no están en el respaldo.
  - Nunca borra ni pisa nada en SharePoint (copyto --immutable; ni sync ni delete).
  - Nunca borra ni modifica nada en Zoom (solo GET y descargas).
  - No duplica: cada archivo lleva su id de Zoom en el nombre (`__zid-<id>`) y lo
    ya respaldado se deduce LISTANDO SharePoint. Renombrar una reunión en Zoom
    no genera una copia nueva.

Credenciales: se leen del CRM en cada corrida (tabla zoom_connection) y se
descifran DENTRO del contenedor de la app, que es quien tiene ENCRYPTION_KEY.
El secreto vive solo en memoria de este proceso: no se escribe en disco ni en
el log, y el token viaja a curl por stdin (no aparece en `ps`).

Uso:
  respaldo-zoom.py            -> SIMULACIÓN: lista qué falta y cuánto pesa
  respaldo-zoom.py --aplicar  -> descarga y sube lo que falta

Configuración por entorno (ver docs/respaldos.md):
  REMOTE         destino rclone, p. ej. sharepoint:Respaldos/zoom   (obligatoria)
  DB_CONTAINER   contenedor de Postgres del CRM                     (obligatoria)
  APP_LABEL      coolify.resourceName de la app (default cadit-crm)
  DB_NAME        default vocero
  DESDE          primer día a revisar, YYYY-MM-DD (default 2020-01-01)
  WORK_DIR       descarga temporal (default /var/tmp/respaldo-zoom)
  ZONA           zona horaria de las carpetas (default America/Montevideo)
  BWLIMIT        límite de ancho de banda para curl y rclone, p. ej. 20M (opcional)
"""

from __future__ import annotations

import fcntl
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from base64 import b64encode
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

API = "https://api.zoom.us/v2"
OAUTH = "https://zoom.us/oauth/token"
TRAMO_DIAS = 30  # Zoom acepta como máximo un mes por pedido de grabaciones.

# ============================================================
# Partes puras (cubiertas por test_respaldo_zoom.py)
# ============================================================


def tramos(desde: date, hasta: date) -> list[tuple[str, str]]:
    """Parte [desde, hasta] (inclusive) en tramos contiguos de ≤ 30 días."""
    out = []
    inicio = desde
    while inicio <= hasta:
        fin = min(inicio + timedelta(days=TRAMO_DIAS - 1), hasta)
        out.append((inicio.isoformat(), fin.isoformat()))
        inicio = fin + timedelta(days=1)
    return out


def limpiar(texto: str, largo: int = 80) -> str:
    """Nombre seguro para SharePoint: sin  " * : < > ? / \\ | # %  ni controles."""
    t = re.sub(r'[\x00-\x1f"*:<>?/\\|#%]', "", texto or "")
    t = re.sub(r"\s+", " ", t).strip(" .")
    t = t[:largo].rstrip(" .")
    return t or "sin-tema"


def zid(file_id: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", file_id)


def ruta_del_archivo(cuenta: str, reunion: dict, archivo: dict, zona: str = "America/Montevideo") -> str:
    inicio = datetime.fromisoformat(reunion["start_time"].replace("Z", "+00:00")).astimezone(ZoneInfo(zona))
    carpeta = f"{inicio:%Y-%m-%d %H%M} {limpiar(reunion.get('topic') or '')} ({reunion.get('id')})"
    tipo = (archivo.get("recording_type") or archivo.get("file_type") or "archivo").lower()
    ext = (archivo.get("file_extension") or archivo.get("file_type") or "bin").lower()
    nombre = f"{limpiar(tipo, 60)}__zid-{zid(archivo['id'])}.{limpiar(ext, 10)}"
    return f"{limpiar(cuenta)}/{inicio:%Y}/{inicio:%Y-%m}/{carpeta}/{nombre}"


_ZID = re.compile(r"__zid-([A-Za-z0-9_-]+)\.[^./]+$")


def ids_respaldados(listado: list[str]) -> set[str]:
    """Ids de Zoom ya presentes en el respaldo, a partir de un listado recursivo."""
    out = set()
    for linea in listado:
        m = _ZID.search(linea.strip())
        if m:
            out.add(m.group(1))
    return out


def exige_tamano_exacto(archivo: dict) -> bool:
    """Solo video y audio: Zoom informa mal el tamaño de sus resúmenes y transcripciones."""
    return (archivo.get("file_type") or "").upper() in {"MP4", "M4A"}


def pendientes(reunion: dict, ya: set[str]) -> list[dict]:
    """Archivos completos de la reunión que todavía no están en el respaldo."""
    return [
        a
        for a in reunion.get("recording_files") or []
        if a.get("id") and a.get("status", "completed") == "completed" and zid(a["id"]) not in ya
    ]


# ============================================================
# Entorno
# ============================================================


def log(msg: str) -> None:
    print(f"{datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ} [respaldo-zoom] {msg}", flush=True)


def env(nombre: str, default: str | None = None) -> str:
    v = os.environ.get(nombre, default)
    if not v:
        sys.exit(f"Falta la variable {nombre} (ver el encabezado de este script)")
    return v


def run(cmd: list[str], entrada: str | None = None) -> str:
    r = subprocess.run(cmd, input=entrada, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"{cmd[0]} {cmd[1] if len(cmd) > 1 else ''} falló: {r.stderr.strip()[:500]}")
    return r.stdout


# Descifra con la MISMA función que usa la app (AES-256-GCM, src/lib/crypto).
_DESCIFRAR = r"""
const c=require("crypto");let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
const k=Buffer.from(process.env.ENCRYPTION_KEY,"base64");
const out=JSON.parse(s).map(z=>{const d=c.createDecipheriv("aes-256-gcm",k,Buffer.from(z.iv,"base64"));
d.setAuthTag(Buffer.from(z.tag,"base64"));
const secret=Buffer.concat([d.update(Buffer.from(z.cipher,"base64")),d.final()]).toString("utf8");
return {name:z.name,account_id:z.account_id,client_id:z.client_id,secret};});
process.stdout.write(JSON.stringify(out));});
"""


def conexiones() -> list[dict]:
    db = env("DB_CONTAINER")
    sql = (
        "select coalesce(json_agg(json_build_object('name',name,'account_id',account_id,"
        "'client_id',client_id,'cipher',client_secret_cipher,'iv',client_secret_iv,"
        "'tag',client_secret_tag) order by name),'[]') from zoom_connection where archived_at is null"
    )
    cifradas = run(["docker", "exec", db, "psql", "-U", "postgres", "-d", env("DB_NAME", "vocero"), "-Atc", sql])
    app = run(["docker", "ps", "-q", "--filter", f"label=coolify.resourceName={env('APP_LABEL', 'cadit-crm')}"]).split()
    if not app:
        raise RuntimeError("No encontré el contenedor de la app (APP_LABEL)")
    return json.loads(run(["docker", "exec", "-i", app[0], "node", "-e", _DESCIFRAR], entrada=cifradas))


# ============================================================
# Zoom (solo lectura)
# ============================================================


class Zoom:
    def __init__(self, con: dict):
        self.con = con
        self._token = ""
        self._vence = 0.0

    def token(self) -> str:
        if time.time() < self._vence - 120:
            return self._token
        basic = b64encode(f"{self.con['client_id']}:{self.con['secret']}".encode()).decode()
        url = f"{OAUTH}?grant_type=account_credentials&account_id={urllib.parse.quote(self.con['account_id'])}"
        req = urllib.request.Request(url, method="POST", headers={"Authorization": f"Basic {basic}"})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        self._token = data["access_token"]
        self._vence = time.time() + int(data.get("expires_in", 3600))
        return self._token

    def get(self, path: str, query: dict) -> dict:
        url = f"{API}{path}?{urllib.parse.urlencode(query)}"
        for intento in range(6):
            req = urllib.request.Request(url, headers={"Authorization": f"Bearer {self.token()}"})
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.load(r)
            except urllib.error.HTTPError as e:
                if e.code == 401 and intento == 0:
                    self._vence = 0  # token vencido o revocado: se pide otro una vez
                    continue
                if e.code == 429 or e.code >= 500:
                    time.sleep(int(e.headers.get("Retry-After") or 0) or min(2**intento * 2, 60))
                    continue
                raise
            except urllib.error.URLError:
                time.sleep(min(2**intento * 2, 60))
        raise RuntimeError(f"Zoom no respondió: {path}")

    def paginas(self, path: str, query: dict, clave: str):
        siguiente = ""
        while True:
            q = {**query, "page_size": 300, **({"next_page_token": siguiente} if siguiente else {})}
            data = self.get(path, q)
            yield from data.get(clave) or []
            siguiente = data.get("next_page_token") or ""
            if not siguiente:
                return

    def usuarios(self) -> list[dict]:
        # Los inactivos también: un profesor dado de baja puede tener grabaciones.
        return [u for st in ("active", "inactive") for u in self.paginas("/users", {"status": st}, "users")]

    def reuniones(self, user_id: str, desde: date, hasta: date):
        for de, a in tramos(desde, hasta):
            yield from self.paginas(f"/users/{urllib.parse.quote(user_id)}/recordings", {"from": de, "to": a, "trash": "false"}, "meetings")


# ============================================================
# Corrida
# ============================================================


def listar_respaldo(remote: str) -> list[str]:
    # SharePoint a veces responde serviceNotAvailable un rato: se reintenta. Si no
    # se puede listar, la corrida NO sigue: sin saber qué hay, duplicaría todo.
    for intento in range(5):
        r = subprocess.run(["rclone", "lsf", "-R", "--files-only", remote], capture_output=True, text=True)
        if r.returncode == 0:
            return r.stdout.splitlines()
        if "directory not found" in r.stderr.lower():
            return []  # primera corrida: todavía no existe la carpeta
        log(f"no pude listar {remote} (intento {intento + 1}/5); reintento en {60 * (intento + 1)} s")
        time.sleep(60 * (intento + 1))
    raise RuntimeError(f"No pude listar {remote}: {r.stderr.strip()[:500]}")


def descargar(zoom: Zoom, archivo: dict, destino: str, bwlimit: str | None) -> None:
    url = archivo["download_url"]
    url += ("&" if "?" in url else "?") + "access_token=" + zoom.token()
    # La URL lleva el token: va por stdin (-K -) para que no quede en `ps` ni en logs.
    cfg = f'url = "{url}"\noutput = "{destino}"\n'
    cmd = ["curl", "-fsSL", "--retry", "5", "--retry-delay", "15", "--connect-timeout", "30", "-K", "-"]
    if bwlimit:
        cmd += ["--limit-rate", bwlimit]
    cmd += ["-w", "%{http_code}"]
    r = subprocess.run(cmd, input=cfg, capture_output=True, text=True)
    if r.returncode != 0:
        if r.stdout.strip() == "404":
            raise NoDisponible("Zoom responde 404")
        raise RuntimeError(f"descarga falló (curl {r.returncode}, HTTP {r.stdout.strip() or '?'})")


class NoDisponible(Exception):
    """Zoom lista el archivo pero no lo entrega todavía: se reintenta en la próxima corrida."""


def subir(local: str, remoto: str, bwlimit: str | None) -> None:
    cmd = ["rclone", "copyto", local, remoto, "--immutable", "--retries", "5"]
    if bwlimit:
        cmd += ["--bwlimit", bwlimit]
    run(cmd)
    # Se lista la CARPETA: en esta biblioteca, lsjson sobre un archivo falla
    # ("found file when looking for folder").
    carpeta, nombre = remoto.rsplit("/", 1)
    info = [f for f in json.loads(run(["rclone", "lsjson", "--files-only", carpeta])) if f.get("Name") == nombre]
    if not info or info[0].get("Size") != os.path.getsize(local):
        raise RuntimeError("el tamaño en SharePoint no coincide con el descargado")


def main() -> int:
    aplicar = "--aplicar" in sys.argv[1:]
    remote = env("REMOTE").rstrip("/")
    work = env("WORK_DIR", "/var/tmp/respaldo-zoom")
    zona = env("ZONA", "America/Montevideo")
    bwlimit = os.environ.get("BWLIMIT") or None
    desde = date.fromisoformat(env("DESDE", "2020-01-01"))
    hoy = date.today()

    os.makedirs(work, mode=0o700, exist_ok=True)
    lock = open(os.path.join(work, ".lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log("ya hay una corrida en curso; salgo sin hacer nada")
        return 0

    ya = ids_respaldados(listar_respaldo(remote))
    log(f"{'APLICANDO' if aplicar else 'SIMULACIÓN'} — {len(ya)} archivos ya respaldados en {remote}")

    agregados: list[str] = []
    errores = avisos = 0
    total_bytes = 0
    for con in conexiones():
        cuenta = con["name"]
        zoom = Zoom(con)
        try:
            usuarios = zoom.usuarios()
        except Exception as e:  # una cuenta rota no frena a las demás
            errores += 1
            log(f"ERROR cuenta {cuenta}: {e}")
            continue
        faltan = bytes_cuenta = subidos = 0
        for u in usuarios:
            try:
                for reunion in zoom.reuniones(u["id"], desde, hoy):
                    for archivo in pendientes(reunion, ya):
                        ruta = ruta_del_archivo(cuenta, reunion, archivo, zona)
                        tam = int(archivo.get("file_size") or 0)
                        faltan += 1
                        bytes_cuenta += tam
                        if not aplicar:
                            continue
                        libre = shutil.disk_usage(work).free
                        if tam and libre < tam * 1.1 + 2 * 1024**3:
                            raise RuntimeError(f"poco disco en {work} para {ruta}")
                        local = os.path.join(work, "en-curso")
                        try:
                            descargar(zoom, archivo, local, bwlimit)
                            bajado = os.path.getsize(local)
                            if bajado == 0 or (tam and exige_tamano_exacto(archivo) and bajado != tam):
                                raise RuntimeError(f"tamaño descargado {bajado} ≠ {tam}")
                            subir(local, f"{remote}/{ruta}", bwlimit)
                            ya.add(zid(archivo["id"]))
                            agregados.append(ruta)
                            subidos += 1
                            log(f"+ {ruta} ({bajado / 1024**2:.1f} MB)")
                        except NoDisponible as e:
                            avisos += 1
                            log(f"AVISO {ruta}: {e}; se reintenta en la próxima corrida")
                        except Exception as e:
                            errores += 1
                            log(f"ERROR {ruta}: {e}")
                        finally:
                            if os.path.exists(local):
                                os.remove(local)
            except Exception as e:
                errores += 1
                log(f"ERROR cuenta {cuenta}, usuario {u.get('email')}: {e}")
        total_bytes += bytes_cuenta
        if aplicar:
            log(f"{cuenta}: {subidos} de {faltan} archivos subidos")
        else:
            log(f"{cuenta}: {faltan} archivos por subir ({bytes_cuenta / 1024**3:.2f} GB)")

    resultado = f"{len(agregados)} archivos subidos" if aplicar else f"simulación, {total_bytes / 1024**3:.2f} GB por subir"
    log(f"FIN — {resultado}; {avisos} no disponibles en Zoom; {errores} errores")
    if aplicar and agregados:
        resumen = "\n".join(agregados) + "\n"
        stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%SZ")
        run(["rclone", "rcat", f"{remote}/_corridas/{stamp}.txt"], entrada=resumen)
    return 1 if errores else 0


if __name__ == "__main__":
    sys.exit(main())
