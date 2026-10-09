-- 2026-10-09 — 030 Grabaciones de Zoom (constitución 1.6.0).
--
--   `zoom_connection`
--     Credenciales de UNA cuenta de Zoom (app Server-to-Server OAuth),
--     cargadas por la UI. El Client Secret va cifrado (AES-256-GCM,
--     `lib/crypto`); solo `client_secret_last4` se muestra. Una conexión
--     cubre uno o muchos usuarios de Zoom: sirve igual si las cuentas de la
--     academia son una organización de Zoom o cinco cuentas sueltas.
--
--   `zoom_recording`
--     Una fila por INSTANCIA de reunión grabada. Llave de idempotencia:
--     `UNIQUE (organization_id, zoom_connection_id, zoom_meeting_uuid)`.
--     `UNIQUE (organization_id, class_session_id)` parcial: una clase, una
--     grabación adjudicada. El CRM no guarda video: solo enlaces.
--
--   `zoom_sync_state` / `zoom_sync_run`
--     El lease de "una sincronización por organización a la vez" y la
--     bitácora de corridas (DV-004).
--
--   Columnas nuevas
--     `virtual_room.zoom_connection_id/zoom_user_id/zoom_user_email` (el
--     usuario de Zoom que hospeda el aula; se vinculan juntos o ninguno) y
--     `class_session.recording_source` ('manual' | 'zoom'), con backfill
--     'manual' para todo enlace existente: lo pegó una persona.
--
--   `role.capabilities`
--     `grabaciones.ver` + `grabaciones.gestionar` a `direccion` y
--     `coordinacion`; solo `grabaciones.ver` a `soporte` (DV-009). Mismo
--     precedente que la 0050/0051: capacidades que hasta hoy no existían.
--
-- Tablas nuevas con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no las escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`; backfills que solo tocan lo que falta.

create table if not exists "zoom_connection" (
	"id" text primary key not null,
	"organization_id" text not null,
	"name" text not null,
	"account_id" text not null,
	"client_id" text not null,
	"client_secret_cipher" text not null,
	"client_secret_iv" text not null,
	"client_secret_tag" text not null,
	"client_secret_last4" text not null,
	"status" text default 'sin_probar' not null,
	"last_error" text,
	"last_tested_at" timestamp,
	"last_sync_at" timestamp,
	"synced_through" date,
	"archived_at" timestamp,
	"created_by" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "zoom_connection_status_valid" check ("status" in ('sin_probar','ok','error'))
);--> statement-breakpoint

create table if not exists "zoom_recording" (
	"id" text primary key not null,
	"organization_id" text not null,
	"zoom_connection_id" text not null,
	"virtual_room_id" text,
	"zoom_meeting_uuid" text not null,
	"zoom_meeting_id" text not null,
	"host_zoom_user_id" text not null,
	"host_email" text,
	"topic" text,
	"start_time" timestamp with time zone not null,
	"duration_min" integer,
	"total_size_bytes" bigint,
	"file_count" integer,
	"share_url" text,
	"play_url" text,
	"passcode_cipher" text,
	"passcode_iv" text,
	"passcode_tag" text,
	"passcode_embedded" boolean default false not null,
	"auto_delete_date" date,
	"first_seen_at" timestamp not null,
	"last_seen_at" timestamp not null,
	"missing_in_zoom_at" timestamp,
	"class_session_id" text,
	"assignment_mode" text default 'auto' not null,
	"assignment_state" text default 'pendiente' not null,
	"candidate_class_ids" text[] default '{}'::text[] not null,
	"conflict_class_session_id" text,
	"assigned_by" text,
	"assigned_at" timestamp,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "zoom_recording_mode_valid" check ("assignment_mode" in ('auto','manual')),
	constraint "zoom_recording_state_valid" check ("assignment_state" in ('pendiente','asignada','ambigua','conflicto','sin_clase')),
	constraint "zoom_recording_assigned_has_class" check (("assignment_state" = 'asignada') = ("class_session_id" is not null))
);--> statement-breakpoint

create table if not exists "zoom_sync_state" (
	"organization_id" text primary key not null,
	"lease_owner" text,
	"lease_until" timestamp,
	"current_run_started_at" timestamp,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "zoom_sync_run" (
	"id" text primary key not null,
	"organization_id" text not null,
	"zoom_connection_id" text not null,
	"trigger" text not null,
	"triggered_by" text,
	"window_from" date not null,
	"window_to" date not null,
	"status" text not null,
	"fetched_count" integer default 0 not null,
	"new_count" integer default 0 not null,
	"assigned_count" integer default 0 not null,
	"ambiguous_count" integer default 0 not null,
	"conflict_count" integer default 0 not null,
	"error" text,
	"started_at" timestamp default now() not null,
	"finished_at" timestamp,
	constraint "zoom_sync_run_trigger_valid" check ("trigger" in ('manual','periodica')),
	constraint "zoom_sync_run_status_valid" check ("status" in ('corriendo','ok','parcial','error'))
);--> statement-breakpoint

alter table "class_session" add column if not exists "recording_source" text;--> statement-breakpoint
alter table "virtual_room" add column if not exists "zoom_connection_id" text;--> statement-breakpoint
alter table "virtual_room" add column if not exists "zoom_user_id" text;--> statement-breakpoint
alter table "virtual_room" add column if not exists "zoom_user_email" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'zoom_connection_organization_id_organization_id_fk') then
    alter table "zoom_connection" add constraint "zoom_connection_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_connection_created_by_user_id_fk') then
    alter table "zoom_connection" add constraint "zoom_connection_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_organization_id_organization_id_fk') then
    alter table "zoom_recording" add constraint "zoom_recording_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_zoom_connection_id_zoom_connection_id_fk') then
    alter table "zoom_recording" add constraint "zoom_recording_zoom_connection_id_zoom_connection_id_fk"
      foreign key ("zoom_connection_id") references "public"."zoom_connection"("id") on delete restrict on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_virtual_room_id_virtual_room_id_fk') then
    alter table "zoom_recording" add constraint "zoom_recording_virtual_room_id_virtual_room_id_fk"
      foreign key ("virtual_room_id") references "public"."virtual_room"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_class_session_id_class_session_id_fk') then
    alter table "zoom_recording" add constraint "zoom_recording_class_session_id_class_session_id_fk"
      foreign key ("class_session_id") references "public"."class_session"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_conflict_class_session_id_class_session_id_fk') then
    alter table "zoom_recording" add constraint "zoom_recording_conflict_class_session_id_class_session_id_fk"
      foreign key ("conflict_class_session_id") references "public"."class_session"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_assigned_by_user_id_fk') then
    alter table "zoom_recording" add constraint "zoom_recording_assigned_by_user_id_fk"
      foreign key ("assigned_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_sync_state_organization_id_organization_id_fk') then
    alter table "zoom_sync_state" add constraint "zoom_sync_state_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_sync_run_organization_id_organization_id_fk') then
    alter table "zoom_sync_run" add constraint "zoom_sync_run_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_sync_run_zoom_connection_id_zoom_connection_id_fk') then
    alter table "zoom_sync_run" add constraint "zoom_sync_run_zoom_connection_id_zoom_connection_id_fk"
      foreign key ("zoom_connection_id") references "public"."zoom_connection"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_sync_run_triggered_by_user_id_fk') then
    alter table "zoom_sync_run" add constraint "zoom_sync_run_triggered_by_user_id_fk"
      foreign key ("triggered_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'virtual_room_zoom_connection_id_zoom_connection_id_fk') then
    alter table "virtual_room" add constraint "virtual_room_zoom_connection_id_zoom_connection_id_fk"
      foreign key ("zoom_connection_id") references "public"."zoom_connection"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'virtual_room_zoom_link_together') then
    alter table "virtual_room" add constraint "virtual_room_zoom_link_together"
      check (("zoom_connection_id" is null) = ("zoom_user_id" is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'class_session_recording_source_valid') then
    alter table "class_session" add constraint "class_session_recording_source_valid"
      check ("recording_source" is null or "recording_source" in ('manual','zoom'));
  end if;
end $$;--> statement-breakpoint

create index if not exists "zoom_connection_org_idx" on "zoom_connection" using btree ("organization_id");--> statement-breakpoint
create unique index if not exists "zoom_connection_org_name_uq" on "zoom_connection" using btree ("organization_id","name");--> statement-breakpoint
create unique index if not exists "zoom_connection_org_account_uq" on "zoom_connection" using btree ("organization_id","account_id");--> statement-breakpoint
create unique index if not exists "zoom_recording_org_conn_uuid_uq" on "zoom_recording" using btree ("organization_id","zoom_connection_id","zoom_meeting_uuid");--> statement-breakpoint
create unique index if not exists "zoom_recording_org_class_uq" on "zoom_recording" using btree ("organization_id","class_session_id") where "zoom_recording"."class_session_id" is not null;--> statement-breakpoint
create index if not exists "zoom_recording_org_start_idx" on "zoom_recording" using btree ("organization_id","start_time" DESC NULLS LAST);--> statement-breakpoint
create index if not exists "zoom_recording_org_room_start_idx" on "zoom_recording" using btree ("organization_id","virtual_room_id","start_time" DESC NULLS LAST);--> statement-breakpoint
create index if not exists "zoom_recording_org_state_idx" on "zoom_recording" using btree ("organization_id","assignment_state");--> statement-breakpoint
create index if not exists "zoom_recording_org_meeting_idx" on "zoom_recording" using btree ("organization_id","zoom_meeting_id");--> statement-breakpoint
create index if not exists "zoom_sync_run_org_conn_started_idx" on "zoom_sync_run" using btree ("organization_id","zoom_connection_id","started_at" DESC NULLS LAST);--> statement-breakpoint
create unique index if not exists "virtual_room_zoom_user_uq" on "virtual_room" using btree ("organization_id","zoom_connection_id","zoom_user_id") where "virtual_room"."zoom_user_id" is not null and "virtual_room"."archived_at" is null;--> statement-breakpoint

-- Todo enlace de grabación que ya existe lo pegó una persona.
update "class_session"
set "recording_source" = 'manual'
where "recording_url" is not null and "recording_source" is null;--> statement-breakpoint

-- Las capacidades nuevas, a los roles de sistema que ya existen (DV-009).
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('grabaciones.ver'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('grabaciones.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('grabaciones.gestionar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('grabaciones.gestionar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('grabaciones.ver'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('grabaciones.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('grabaciones.gestionar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('grabaciones.gestionar'));--> statement-breakpoint
-- Soporte ve las grabaciones (pasa el enlace a un alumno), no las adjudica.
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('grabaciones.ver'),
    "updated_at" = now()
where "key" = 'soporte'
  and not ("capabilities" @> jsonb_build_array('grabaciones.ver'));--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "zoom_connection" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_connection";--> statement-breakpoint
create policy tenant_isolation on "zoom_connection"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "zoom_recording" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_recording";--> statement-breakpoint
create policy tenant_isolation on "zoom_recording"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "zoom_sync_state" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_sync_state";--> statement-breakpoint
create policy tenant_isolation on "zoom_sync_state"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "zoom_sync_run" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_sync_run";--> statement-breakpoint
create policy tenant_isolation on "zoom_sync_run"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
