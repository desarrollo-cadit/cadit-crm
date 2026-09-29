---
name: proyecto-coolify-deploy
description: Cómo despliega CadIT CRM (Coolify Ruta A) y dónde viven las credenciales necesarias, incluida la traba de sandbox que impide leerlas.
metadata:
  type: project
---

CadIT CRM despliega en Coolify (Ruta A). Referencia operativa completa:
`docs/replica-base-coolify.md` (guía de réplica de base + variables de entorno
de la app en Coolify, punto 8) y `docs/rls-rol-de-conexion.md` (por qué la app
se conecta como `cadit_app` y no `postgres`).

Migraciones (`drizzle/*.sql`) corren al ARRANCAR el contenedor
(`scripts/migrate.mjs`, bundleado en el Dockerfile: `node migrate.mjs && node
server.js`), NO en un Pre-Deployment Command separado de Coolify. Log de
éxito esperado: `[migrate] migraciones aplicadas`.

`cadit_app` (rol de conexión de producción) tiene DML (`select/insert/update/
delete`) vía `alter default privileges` (migración 0026) sobre TODO lo que se
cree después en `schema public`, pero la migración 0026 NO le otorga `create`
explícito sobre `schema public` — sólo `usage`. Pese a eso, migraciones
posteriores que crean tablas nuevas (ej. 0039) ya se aplicaron en producción
sin intervención manual, lo que sugiere que el privilegio `CREATE` sobre
`public` sigue en el rol pseudo `PUBLIC` (default de Postgres no revocado
explícitamente en ninguna migración — no confirmado por falta de acceso a la
base real). **No asumir esto como garantía**: verificar en logs post-deploy
que la migración nueva realmente aplicó sin error, cada vez.

**Bloqueo de sandbox recurrente**: en esta máquina (Windows, cwd
`C:\Users\Ale\Documents\Gestion-Academia\cadit-crm`), los permisos de la
sesión de Claude Code DENIEGAN por completo el acceso — con Read Y con Bash —
a `.env.coolify` y `.env.prod-tunnel` (ni siquiera nombres de variable, error
"File is in a directory that is denied by your permission settings"). Esos
dos archivos son la fuente documentada de: token/URL del panel de Coolify,
host/usuario/clave SSH del túnel, y la cadena de conexión de BD para
producción. Sin acceso a ellos, un deploy-ops en esta sesión NO puede: activar
el deploy vía API de Coolify, abrir el túnel SSH, ni correr consultas
read-only contra la BD de producción. Hace falta que el dueño (1) ajuste el
permiso de sesión para permitir lectura de esos dos archivos, o (2) pegue los
valores puntuales que hagan falta (fuera de este chat si son secretos) para
esa tarea específica.

`ssh`, `docker`, `psql` y `curl` SÍ están disponibles como binarios en esta
máquina — lo que falta son las credenciales/endpoints, no las herramientas.

Ver también [[proyecto-cursos-offline-migraciones]] (si se crea) para el
detalle de las migraciones 0042-0045.
