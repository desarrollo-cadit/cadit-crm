-- 2026-10-27 — Asistencia sugerida desde Zoom (constitución 1.9.0).
--
--   `zoom_attendance_fetch`     una fila por clase: la máquina de estados de
--                               "traer de Zoom" (pendiente, lista,
--                               sin_reunion, ambigua, no_lista, sin_permiso,
--                               fuera_de_plazo, error). NUNCA toca
--                               `attendance`.
--   `zoom_participant_segment`  cada tramo de conexión del reporte de
--                               participantes, minimizado (nombre visible,
--                               correo si viene, ids de Zoom, entrada y
--                               salida). Sin IP, ubicación ni dispositivo.
--                               Se purga a los 180 días.
--   `zoom_participant_alias`    lo aprendido: llave de Zoom → contacto (o
--                               "ignorar"). Por organización; se olvida
--                               desde /settings/zoom; borrar el contacto lo
--                               borra (cascade).
--   `zoom_attendance_settings`  umbrales por organización (50 % con piso de
--                               20 minutos; "tarde" apagado en v1).
--
--   Columnas nuevas en `attendance`:
--     `source` ('manual' | 'zoom'; NULL = anterior a 0080, no se sabe) y
--     `zoom_minutes` (minutos según Zoom al confirmar).
--
-- La SUGERENCIA no tiene tabla: se calcula al leer. Una marca en
-- `attendance` vuelve "tomada" la clase (`claseCuentaParaElAlumno`), así que
-- solo la confirmación de una persona escribe ahí.
--
-- RLS: las cuatro nacen con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`.

create table if not exists "zoom_attendance_fetch" (
	"id" text primary key not null,
	"organization_id" text not null,
	"class_session_id" text not null,
	"zoom_connection_id" text,
	"zoom_meeting_id" text,
	"zoom_meeting_uuid" text,
	"instance_source" text,
	"status" text default 'pendiente' not null,
	"attempts" integer default 0 not null,
	"next_attempt_at" timestamp,
	"fetched_at" timestamp,
	"error_code" text,
	"error_message" text,
	"candidates" jsonb default '[]'::jsonb not null,
	"reviewed_at" timestamp,
	"reviewed_by" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "zoom_attendance_settings" (
	"organization_id" text primary key not null,
	"min_pct" integer default 50 not null,
	"min_minutes" integer default 20 not null,
	"late_minutes" integer,
	"updated_by" text,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "zoom_participant_alias" (
	"id" text primary key not null,
	"organization_id" text not null,
	"key_kind" text not null,
	"key" text not null,
	"label" text not null,
	"contact_id" text,
	"ignorar" boolean default false not null,
	"confirmations" integer default 0 not null,
	"rejections" integer default 0 not null,
	"rejected_contact_ids" text[] default '{}'::text[] not null,
	"last_used_at" timestamp,
	"created_by" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "zoom_participant_segment" (
	"id" text primary key not null,
	"organization_id" text not null,
	"fetch_id" text not null,
	"zoom_participant_id" text not null,
	"participant_user_id" text,
	"registrant_id" text,
	"display_name" text not null,
	"email" text,
	"join_time" timestamp with time zone not null,
	"leave_time" timestamp with time zone not null,
	"duration_sec" integer default 0 not null,
	"breakout" boolean default false not null,
	"waiting_room" boolean default false not null,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

alter table "attendance" add column if not exists "source" text;--> statement-breakpoint
alter table "attendance" add column if not exists "zoom_minutes" integer;--> statement-breakpoint

do $$
begin
  -- CHECKs
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_fetch_status_valid') then
    alter table "zoom_attendance_fetch" add constraint "zoom_attendance_fetch_status_valid"
      check ("status" in ('pendiente','lista','sin_reunion','ambigua','no_lista','sin_permiso','fuera_de_plazo','error'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_fetch_source_valid') then
    alter table "zoom_attendance_fetch" add constraint "zoom_attendance_fetch_source_valid"
      check ("instance_source" is null or "instance_source" in ('grabacion','reporte_usuario','instancias','manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_settings_pct_valid') then
    alter table "zoom_attendance_settings" add constraint "zoom_attendance_settings_pct_valid"
      check ("min_pct" between 1 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_settings_min_valid') then
    alter table "zoom_attendance_settings" add constraint "zoom_attendance_settings_min_valid"
      check ("min_minutes" between 0 and 600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_settings_late_valid') then
    alter table "zoom_attendance_settings" add constraint "zoom_attendance_settings_late_valid"
      check ("late_minutes" is null or "late_minutes" between 1 and 180);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_participant_alias_kind_valid') then
    alter table "zoom_participant_alias" add constraint "zoom_participant_alias_kind_valid"
      check ("key_kind" in ('correo','usuario_zoom','registrante','nombre'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_participant_alias_ignorar_sin_contacto') then
    alter table "zoom_participant_alias" add constraint "zoom_participant_alias_ignorar_sin_contacto"
      check (not "ignorar" or "contact_id" is null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'attendance_source_valid') then
    alter table "attendance" add constraint "attendance_source_valid"
      check ("source" is null or "source" in ('manual','zoom'));
  end if;
  -- zoom_attendance_fetch
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_fetch_organization_id_organization_id_fk') then
    alter table "zoom_attendance_fetch" add constraint "zoom_attendance_fetch_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_fetch_class_session_id_class_session_id_fk') then
    alter table "zoom_attendance_fetch" add constraint "zoom_attendance_fetch_class_session_id_class_session_id_fk"
      foreign key ("class_session_id") references "public"."class_session"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_fetch_zoom_connection_id_zoom_connection_id_fk') then
    alter table "zoom_attendance_fetch" add constraint "zoom_attendance_fetch_zoom_connection_id_zoom_connection_id_fk"
      foreign key ("zoom_connection_id") references "public"."zoom_connection"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_fetch_reviewed_by_user_id_fk') then
    alter table "zoom_attendance_fetch" add constraint "zoom_attendance_fetch_reviewed_by_user_id_fk"
      foreign key ("reviewed_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  -- zoom_attendance_settings
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_settings_organization_id_organization_id_fk') then
    alter table "zoom_attendance_settings" add constraint "zoom_attendance_settings_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_attendance_settings_updated_by_user_id_fk') then
    alter table "zoom_attendance_settings" add constraint "zoom_attendance_settings_updated_by_user_id_fk"
      foreign key ("updated_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  -- zoom_participant_alias
  if not exists (select 1 from pg_constraint where conname = 'zoom_participant_alias_organization_id_organization_id_fk') then
    alter table "zoom_participant_alias" add constraint "zoom_participant_alias_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_participant_alias_contact_id_contact_id_fk') then
    alter table "zoom_participant_alias" add constraint "zoom_participant_alias_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_participant_alias_created_by_user_id_fk') then
    alter table "zoom_participant_alias" add constraint "zoom_participant_alias_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  -- zoom_participant_segment
  if not exists (select 1 from pg_constraint where conname = 'zoom_participant_segment_organization_id_organization_id_fk') then
    alter table "zoom_participant_segment" add constraint "zoom_participant_segment_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_participant_segment_fetch_id_zoom_attendance_fetch_id_fk') then
    alter table "zoom_participant_segment" add constraint "zoom_participant_segment_fetch_id_zoom_attendance_fetch_id_fk"
      foreign key ("fetch_id") references "public"."zoom_attendance_fetch"("id") on delete cascade on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "zoom_attendance_fetch_class_uq" on "zoom_attendance_fetch" using btree ("class_session_id");--> statement-breakpoint
create index if not exists "zoom_attendance_fetch_org_status_idx" on "zoom_attendance_fetch" using btree ("organization_id","status","next_attempt_at");--> statement-breakpoint
create unique index if not exists "zoom_participant_alias_org_key_uq" on "zoom_participant_alias" using btree ("organization_id","key_kind","key");--> statement-breakpoint
create index if not exists "zoom_participant_alias_org_contact_idx" on "zoom_participant_alias" using btree ("organization_id","contact_id");--> statement-breakpoint
create unique index if not exists "zoom_participant_segment_fetch_uq" on "zoom_participant_segment" using btree ("fetch_id","zoom_participant_id","join_time");--> statement-breakpoint
create index if not exists "zoom_participant_segment_org_created_idx" on "zoom_participant_segment" using btree ("organization_id","created_at");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "zoom_attendance_fetch" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_attendance_fetch";--> statement-breakpoint
create policy tenant_isolation on "zoom_attendance_fetch"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "zoom_participant_segment" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_participant_segment";--> statement-breakpoint
create policy tenant_isolation on "zoom_participant_segment"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "zoom_participant_alias" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_participant_alias";--> statement-breakpoint
create policy tenant_isolation on "zoom_participant_alias"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "zoom_attendance_settings" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_attendance_settings";--> statement-breakpoint
create policy tenant_isolation on "zoom_attendance_settings"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
