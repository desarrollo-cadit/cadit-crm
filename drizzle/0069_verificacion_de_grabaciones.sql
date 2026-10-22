-- 2026-10-22 — Verificación diaria de grabaciones de Zoom.
--
-- La sincronización es incremental: solo mira la ventana reciente, así que
-- una grabación borrada de Zoom días después de traerla nunca se volvía a
-- revisar y seguía enlazada a su clase. La verificación diaria vuelve a
-- listar ZOOM_VERIFY_DAYS (180) días, marca las que faltan, las desvincula y
-- las borra a los ZOOM_MISSING_PURGE_DAYS (30) días.
--
--   1. `zoom_connection.last_verify_at` / `last_verify_error`: cuándo terminó
--      la última verificación (con o sin error). La periódica la corre una vez
--      por día con esta marca, que sobrevive a los reinicios.
--   2. `zoom_recording.missing_from_class_session_id`: la clase de la que se
--      la desvinculó al faltar, para restaurar una asignación MANUAL si la
--      grabación vuelve a aparecer. FK con nombre corto: el automático pasa
--      los 63 bytes de Postgres (y el `if not exists` nunca lo encontraría).
--
-- Sin backfill: la primera sincronización o verificación desvincula las que
-- ya estaban marcadas como faltantes y seguían enlazadas.
--
-- RE-EJECUTABLE (constitución IV): `add column if not exists` y la FK dentro
-- de un `do $$` que mira `pg_constraint`. RLS no cambia (columnas nuevas en
-- tablas que ya tienen `tenant_isolation`).

alter table "zoom_connection" add column if not exists "last_verify_at" timestamp;--> statement-breakpoint
alter table "zoom_connection" add column if not exists "last_verify_error" text;--> statement-breakpoint
alter table "zoom_recording" add column if not exists "missing_from_class_session_id" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_missing_from_class_fk') then
    alter table "zoom_recording" add constraint "zoom_recording_missing_from_class_fk"
      foreign key ("missing_from_class_session_id") references "public"."class_session"("id") on delete set null on update no action;
  end if;
end $$;
