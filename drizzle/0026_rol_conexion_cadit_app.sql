-- 012 (T027) — `cadit_app`: el rol de conexión SUJETO a RLS.
--
-- Ojo con la palabra "rol": acá significa **usuario de PostgreSQL**, no los
-- roles de la aplicación (`direccion`, `coordinacion`, `soporte`, tabla
-- `role`). Son dos cosas sin relación que comparten nombre.
--
-- ============================================================
-- POR QUÉ EXISTE: sin esto, la fase 5 entera es decorado
-- ============================================================
-- Postgres saltea RLS para el dueño de las tablas y para los superusuarios.
-- La app se conecta como `postgres`, que es las dos cosas, así que las
-- políticas de 0025 no filtran absolutamente nada. Demostrado en vivo sobre
-- una tabla con RLS activo y política que debería devolver cero:
--
--     como postgres,   sin app.current_org  ->  2 filas   (RLS salteado)
--     como cadit_app,  sin app.current_org  ->  0 filas
--     como cadit_app,  con app.current_org  ->  1 fila    (solo la suya)
--
-- Lo único que cambió entre esas tres consultas fue CON QUÉ USUARIO se
-- conecta. Por eso este paso no es prolijidad final: es el paso.
--
-- ============================================================
-- LO QUE `cadit_app` NO TIENE, que es lo importante
-- ============================================================
--   * NO es superusuario      -> no saltea RLS
--   * NO tiene BYPASSRLS      -> no saltea RLS
--   * NO es dueño de ninguna tabla -> no saltea RLS
--   * NO tiene CREATEDB ni CREATEROLE
--
-- Las tres primeras son tres puertas distintas al mismo lugar. Cerrar dos y
-- dejar una abierta no sirve de nada.
--
-- La migración NO cambia `DATABASE_URL`: crear el rol es reversible, apuntar
-- la app a él no lo es en caliente. Ese cambio es T028 y va a mano, primero
-- contra base efímera. Ver `docs/rls-rol-de-conexion.md`.
--
-- ============================================================
-- Idempotente: se puede correr sobre una base que ya lo tiene.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'cadit_app') then
    -- Sin contraseña acá a propósito: un secreto en una migración queda
    -- versionado en git para siempre. La fija el operador (ver el doc).
    create role cadit_app login;
  end if;
end $$;
--> statement-breakpoint

-- Conectarse y ver el esquema. `usage` no da acceso a los datos: solo permite
-- nombrar los objetos que hay adentro.
--
-- El `grant connect` va dentro de un bloque porque `grant on database` exige
-- un IDENTIFICADOR y no acepta `current_database()`. Y no se puede escribir el
-- nombre a mano: la base se llama `vocero` en desarrollo y puede llamarse
-- distinto en otra instalación — una migración con el nombre incrustado falla
-- en la primera instancia que no se llame igual.
do $$
begin
  execute format('grant connect on database %I to cadit_app', current_database());
end $$;
--> statement-breakpoint
grant usage on schema public to cadit_app;--> statement-breakpoint

-- Datos: los cuatro verbos sobre lo que existe hoy. NO se otorga `truncate`
-- (RLS no lo filtra: vacía la tabla entera sin mirar políticas) ni `references`
-- ni DDL. La app lee y escribe filas; no altera el esquema.
grant select, insert, update, delete on all tables in schema public to cadit_app;--> statement-breakpoint
grant usage, select on all sequences in schema public to cadit_app;--> statement-breakpoint

-- Y sobre lo que se cree DESPUÉS. Sin esto, la próxima migración que agregue
-- una tabla la dejaría invisible para la app: el síntoma sería un "permission
-- denied" en producción semanas más tarde, lejos del cambio que lo causó.
alter default privileges in schema public
  grant select, insert, update, delete on tables to cadit_app;--> statement-breakpoint
alter default privileges in schema public
  grant usage, select on sequences to cadit_app;
