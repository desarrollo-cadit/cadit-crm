-- 2026-10-08 — 029 Agente por áreas: derivación por correo a Ventas/Soporte.
--
--   `area_config`
--     Una fila por organización y área externa: casilla, copias (manuales y
--     vendedores por id), texto de cierre al cliente y horario. Ausente =
--     área sin configurar (el agente da un cierre genérico, nunca un correo).
--
--   `area_handoff` / `area_handoff_email`
--     El CASO derivado y cada correo que salió de él (apertura/seguimiento).
--     `UNIQUE (handoff_id, source_message_id)`: re-ejecutar el turno del
--     mismo entrante no duplica el correo (constitución IV).
--
--   Columnas nuevas
--     `agent_profile.area_routing_enabled` (interruptor, default apagado),
--     `teacher.wa_identity` (reconocer al profesor por WhatsApp; único por
--     organización cuando no es NULL), `message.ai_topic` (tema del turno) y
--     `agent_test_case.routing` (ruteo del Laboratorio).
--
--   `role.capabilities` de `direccion`
--     Suma `areas.configurar` (mismo precedente que la 0050). Solo
--     `direccion`: coordinación, soporte y administración no la reciben.
--
-- Tablas nuevas con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no las escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`; la capacidad solo donde todavía no está (`@>`).

create table if not exists "area_config" (
	"id" text primary key not null,
	"organization_id" text not null,
	"area" text not null,
	"enabled" boolean default false not null,
	"mailbox" text,
	"cc_emails" text[] default '{}'::text[] not null,
	"cc_seller_ids" text[] default '{}'::text[] not null,
	"contact_text" text,
	"office_hours" jsonb,
	"updated_by" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "area_config_area_valid" check ("area" in ('ventas','soporte')),
	constraint "area_config_sellers_only_ventas" check ("area" = 'ventas' or cardinality("cc_seller_ids") = 0)
);--> statement-breakpoint

create table if not exists "area_handoff" (
	"id" text primary key not null,
	"organization_id" text not null,
	"conversation_id" text not null,
	"contact_id" text not null,
	"area" text not null,
	"case_ref" text not null,
	"summary" text not null,
	"collected" jsonb default '{}'::jsonb not null,
	"missing" text[] default '{}'::text[] not null,
	"status" text not null,
	"subject" text not null,
	"graph_conversation_id" text,
	"is_test" boolean default false not null,
	"last_activity_at" timestamp not null,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "area_handoff_area_valid" check ("area" in ('ventas','soporte')),
	constraint "area_handoff_summary_present" check (length(trim("summary")) > 0),
	constraint "area_handoff_status_valid" check ("status" in ('pendiente','enviado','fallido','sin_configurar','simulado'))
);--> statement-breakpoint

create table if not exists "area_handoff_email" (
	"id" text primary key not null,
	"organization_id" text not null,
	"handoff_id" text not null,
	"kind" text not null,
	"source_message_id" text not null,
	"status" text not null,
	"recipients" jsonb not null,
	"collected_delta" jsonb default '{}'::jsonb not null,
	"rendered_subject" text not null,
	"error" text,
	"graph_message_id" text,
	"internet_message_id" text,
	"sent_at" timestamp,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "area_handoff_email_kind_valid" check ("kind" in ('apertura','seguimiento')),
	constraint "area_handoff_email_status_valid" check ("status" in ('pendiente','enviado','fallido','sin_configurar','simulado'))
);--> statement-breakpoint

alter table "agent_profile" add column if not exists "area_routing_enabled" boolean default false not null;--> statement-breakpoint
alter table "agent_test_case" add column if not exists "routing" jsonb;--> statement-breakpoint
alter table "message" add column if not exists "ai_topic" text;--> statement-breakpoint
alter table "teacher" add column if not exists "wa_identity" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'area_config_organization_id_organization_id_fk') then
    alter table "area_config" add constraint "area_config_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_config_updated_by_user_id_fk') then
    alter table "area_config" add constraint "area_config_updated_by_user_id_fk"
      foreign key ("updated_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_handoff_organization_id_organization_id_fk') then
    alter table "area_handoff" add constraint "area_handoff_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_handoff_conversation_id_conversation_id_fk') then
    alter table "area_handoff" add constraint "area_handoff_conversation_id_conversation_id_fk"
      foreign key ("conversation_id") references "public"."conversation"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_handoff_contact_id_contact_id_fk') then
    alter table "area_handoff" add constraint "area_handoff_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_handoff_email_organization_id_organization_id_fk') then
    alter table "area_handoff_email" add constraint "area_handoff_email_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_handoff_email_handoff_id_area_handoff_id_fk') then
    alter table "area_handoff_email" add constraint "area_handoff_email_handoff_id_area_handoff_id_fk"
      foreign key ("handoff_id") references "public"."area_handoff"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_handoff_email_source_message_id_message_id_fk') then
    alter table "area_handoff_email" add constraint "area_handoff_email_source_message_id_message_id_fk"
      foreign key ("source_message_id") references "public"."message"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'message_ai_topic_valid') then
    alter table "message" add constraint "message_ai_topic_valid"
      check ("ai_topic" is null or "ai_topic" in ('ventas','soporte','academia','sin_determinar'));
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "area_config_org_area_uq" on "area_config" using btree ("organization_id","area");--> statement-breakpoint
create index if not exists "area_handoff_open_idx" on "area_handoff" using btree ("organization_id","contact_id","area","last_activity_at" DESC NULLS LAST);--> statement-breakpoint
create index if not exists "area_handoff_conv_idx" on "area_handoff" using btree ("organization_id","conversation_id","created_at" DESC NULLS LAST);--> statement-breakpoint
create unique index if not exists "area_handoff_case_ref_uq" on "area_handoff" using btree ("organization_id","case_ref");--> statement-breakpoint
create unique index if not exists "area_handoff_email_source_uq" on "area_handoff_email" using btree ("handoff_id","source_message_id");--> statement-breakpoint
create index if not exists "area_handoff_email_status_idx" on "area_handoff_email" using btree ("organization_id","status");--> statement-breakpoint
create unique index if not exists "teacher_org_wa_identity_uq" on "teacher" using btree ("organization_id","wa_identity") where "teacher"."wa_identity" is not null;--> statement-breakpoint

-- La capacidad nueva, a la dirección de cada organización que ya existe.
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('areas.configurar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('areas.configurar'));--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "area_config" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "area_config";--> statement-breakpoint
create policy tenant_isolation on "area_config"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "area_handoff" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "area_handoff";--> statement-breakpoint
create policy tenant_isolation on "area_handoff"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "area_handoff_email" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "area_handoff_email";--> statement-breakpoint
create policy tenant_isolation on "area_handoff_email"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
