-- 2026-10-22 — 045 Marketing: campañas por correo (constitución 1.8.0, II.3).
--
--   Ocho tablas de dominio (data-model §1–§8):
--     `marketing_settings`            buzón, remitente y pie (una fila por organización)
--     `marketing_audience`            filtros guardados (se evalúan al usarse)
--     `marketing_campaign`            la campaña (borrador → enviando → enviada | cancelada)
--     `marketing_campaign_recipient`  la foto de a quién se le envía, congelada al confirmar
--     `marketing_campaign_link`       destinos permitidos de los clics (sin redirección abierta)
--     `marketing_click`               cada clic
--     `marketing_unsubscribe`         bajas de marketing (por contacto y por correo)
--     `marketing_image`               imágenes subidas, servidas por un token público
--
--   Índices únicos que garantizan reglas de negocio:
--     `marketing_campaign_one_sending_uq`      una campaña enviándose por organización (DV-005)
--     `marketing_recipient_campaign_email_uq`  a lo sumo un correo por dirección y campaña (FR-004)
--     `marketing_unsub_org_email_active_uq`    una baja activa por dirección (DV-011)
--     `marketing_audience_org_name_uq`         nombre de audiencia sin repetir (sin mayúsculas)
--
--   Capacidades a los roles de sistema que ya existen, por llave
--     `marketing.ver` y `marketing.enviar`: dirección, coordinación y ventas.
--     `marketing.configurar`: dirección. Cada `update` solo toca la fila a la
--     que le falta. Los roles creados a mano no se tocan. Las organizaciones
--     nuevas las reciben de `SYSTEM_ROLES` (`tests/unit/seed-roles.test.ts`).
--
-- RLS: las ocho nacen con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas e índices; FKs y
-- CHECKs dentro de `do $$` contra `pg_constraint`; políticas con
-- `drop policy if exists`; capacidades con `where not (… @> …)`.

create table if not exists "marketing_settings" (
	"id" text primary key not null,
	"organization_id" text not null,
	"sender_email" text,
	"sender_name" text,
	"footer_address" text,
	"footer_contact" text,
	"verified_sender" text,
	"verified_at" timestamp,
	"last_test_at" timestamp,
	"last_test_error" text,
	"updated_by" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "marketing_audience" (
	"id" text primary key not null,
	"organization_id" text not null,
	"name" text not null,
	"filters" jsonb not null,
	"created_by" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "marketing_campaign" (
	"id" text primary key not null,
	"organization_id" text not null,
	"name" text not null,
	"subject" text not null,
	"body" jsonb default '{"v":1,"blocks":[]}'::jsonb not null,
	"audience_id" text,
	"filters" jsonb,
	"status" text default 'borrador' not null,
	"recipient_count" integer,
	"sender_email" text,
	"sender_name" text,
	"footer" jsonb,
	"created_by" text,
	"sent_by" text,
	"send_confirmed_at" timestamp,
	"finished_at" timestamp,
	"cancelled_by" text,
	"lease_until" timestamp,
	"paused_until" timestamp,
	"last_error" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "marketing_campaign_recipient" (
	"id" text primary key not null,
	"organization_id" text not null,
	"campaign_id" text not null,
	"contact_id" text,
	"email" text not null,
	"first_name" text not null,
	"last_name" text,
	"vars" jsonb default '{}'::jsonb not null,
	"position" integer not null,
	"status" text default 'pendiente' not null,
	"reason" text,
	"attempted_at" timestamp,
	"sent_at" timestamp,
	"unsubscribed_at" timestamp
);--> statement-breakpoint

create table if not exists "marketing_campaign_link" (
	"id" text primary key not null,
	"organization_id" text not null,
	"campaign_id" text not null,
	"position" integer not null,
	"url" text not null
);--> statement-breakpoint

create table if not exists "marketing_click" (
	"id" text primary key not null,
	"organization_id" text not null,
	"campaign_id" text not null,
	"recipient_id" text not null,
	"link_id" text not null,
	"clicked_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "marketing_unsubscribe" (
	"id" text primary key not null,
	"organization_id" text not null,
	"contact_id" text,
	"email" text not null,
	"campaign_id" text,
	"recipient_id" text,
	"created_at" timestamp default now() not null,
	"reverted_at" timestamp,
	"reverted_by" text
);--> statement-breakpoint

create table if not exists "marketing_image" (
	"id" text primary key not null,
	"organization_id" text not null,
	"campaign_id" text not null,
	"public_token" text not null,
	"mime_type" text not null,
	"size_bytes" integer not null,
	"created_by" text,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

do $$
begin
  -- CHECKs
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_status_valid') then
    alter table "marketing_campaign" add constraint "marketing_campaign_status_valid"
      check ("status" in ('borrador', 'enviando', 'enviada', 'cancelada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_recipient_status_valid') then
    alter table "marketing_campaign_recipient" add constraint "marketing_recipient_status_valid"
      check ("status" in ('pendiente', 'enviando', 'enviado', 'fallido', 'omitido', 'cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_image_mime_type_valid') then
    alter table "marketing_image" add constraint "marketing_image_mime_type_valid"
      check ("mime_type" in ('image/jpeg', 'image/png', 'image/webp'));
  end if;

  -- marketing_settings
  if not exists (select 1 from pg_constraint where conname = 'marketing_settings_organization_id_organization_id_fk') then
    alter table "marketing_settings" add constraint "marketing_settings_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_settings_updated_by_user_id_fk') then
    alter table "marketing_settings" add constraint "marketing_settings_updated_by_user_id_fk"
      foreign key ("updated_by") references "public"."user"("id") on delete set null on update no action;
  end if;

  -- marketing_audience
  if not exists (select 1 from pg_constraint where conname = 'marketing_audience_organization_id_organization_id_fk') then
    alter table "marketing_audience" add constraint "marketing_audience_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_audience_created_by_user_id_fk') then
    alter table "marketing_audience" add constraint "marketing_audience_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;

  -- marketing_campaign
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_organization_id_organization_id_fk') then
    alter table "marketing_campaign" add constraint "marketing_campaign_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_audience_id_marketing_audience_id_fk') then
    alter table "marketing_campaign" add constraint "marketing_campaign_audience_id_marketing_audience_id_fk"
      foreign key ("audience_id") references "public"."marketing_audience"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_created_by_user_id_fk') then
    alter table "marketing_campaign" add constraint "marketing_campaign_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_sent_by_user_id_fk') then
    alter table "marketing_campaign" add constraint "marketing_campaign_sent_by_user_id_fk"
      foreign key ("sent_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_cancelled_by_user_id_fk') then
    alter table "marketing_campaign" add constraint "marketing_campaign_cancelled_by_user_id_fk"
      foreign key ("cancelled_by") references "public"."user"("id") on delete set null on update no action;
  end if;

  -- marketing_campaign_recipient
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_recipient_organization_id_organization_id_fk') then
    alter table "marketing_campaign_recipient" add constraint "marketing_campaign_recipient_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_recipient_campaign_id_marketing_campaign_id_fk') then
    alter table "marketing_campaign_recipient" add constraint "marketing_campaign_recipient_campaign_id_marketing_campaign_id_fk"
      foreign key ("campaign_id") references "public"."marketing_campaign"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_recipient_contact_id_contact_id_fk') then
    alter table "marketing_campaign_recipient" add constraint "marketing_campaign_recipient_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete set null on update no action;
  end if;

  -- marketing_campaign_link
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_link_organization_id_organization_id_fk') then
    alter table "marketing_campaign_link" add constraint "marketing_campaign_link_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_campaign_link_campaign_id_marketing_campaign_id_fk') then
    alter table "marketing_campaign_link" add constraint "marketing_campaign_link_campaign_id_marketing_campaign_id_fk"
      foreign key ("campaign_id") references "public"."marketing_campaign"("id") on delete cascade on update no action;
  end if;

  -- marketing_click
  if not exists (select 1 from pg_constraint where conname = 'marketing_click_organization_id_organization_id_fk') then
    alter table "marketing_click" add constraint "marketing_click_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_click_campaign_id_marketing_campaign_id_fk') then
    alter table "marketing_click" add constraint "marketing_click_campaign_id_marketing_campaign_id_fk"
      foreign key ("campaign_id") references "public"."marketing_campaign"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_click_recipient_id_marketing_campaign_recipient_id_fk') then
    alter table "marketing_click" add constraint "marketing_click_recipient_id_marketing_campaign_recipient_id_fk"
      foreign key ("recipient_id") references "public"."marketing_campaign_recipient"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_click_link_id_marketing_campaign_link_id_fk') then
    alter table "marketing_click" add constraint "marketing_click_link_id_marketing_campaign_link_id_fk"
      foreign key ("link_id") references "public"."marketing_campaign_link"("id") on delete cascade on update no action;
  end if;

  -- marketing_unsubscribe
  if not exists (select 1 from pg_constraint where conname = 'marketing_unsubscribe_organization_id_organization_id_fk') then
    alter table "marketing_unsubscribe" add constraint "marketing_unsubscribe_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_unsubscribe_contact_id_contact_id_fk') then
    alter table "marketing_unsubscribe" add constraint "marketing_unsubscribe_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_unsubscribe_campaign_id_marketing_campaign_id_fk') then
    alter table "marketing_unsubscribe" add constraint "marketing_unsubscribe_campaign_id_marketing_campaign_id_fk"
      foreign key ("campaign_id") references "public"."marketing_campaign"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_unsubscribe_recipient_id_marketing_campaign_recipient_id_fk') then
    alter table "marketing_unsubscribe" add constraint "marketing_unsubscribe_recipient_id_marketing_campaign_recipient_id_fk"
      foreign key ("recipient_id") references "public"."marketing_campaign_recipient"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_unsubscribe_reverted_by_user_id_fk') then
    alter table "marketing_unsubscribe" add constraint "marketing_unsubscribe_reverted_by_user_id_fk"
      foreign key ("reverted_by") references "public"."user"("id") on delete set null on update no action;
  end if;

  -- marketing_image
  if not exists (select 1 from pg_constraint where conname = 'marketing_image_organization_id_organization_id_fk') then
    alter table "marketing_image" add constraint "marketing_image_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_image_campaign_id_marketing_campaign_id_fk') then
    alter table "marketing_image" add constraint "marketing_image_campaign_id_marketing_campaign_id_fk"
      foreign key ("campaign_id") references "public"."marketing_campaign"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_image_created_by_user_id_fk') then
    alter table "marketing_image" add constraint "marketing_image_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "marketing_settings_org_uq"
  on "marketing_settings" using btree ("organization_id");--> statement-breakpoint
create unique index if not exists "marketing_audience_org_name_uq"
  on "marketing_audience" using btree ("organization_id", lower("name"));--> statement-breakpoint
create index if not exists "marketing_campaign_org_created_idx"
  on "marketing_campaign" using btree ("organization_id", "created_at" desc nulls last);--> statement-breakpoint
create unique index if not exists "marketing_campaign_one_sending_uq"
  on "marketing_campaign" using btree ("organization_id") where "status" = 'enviando';--> statement-breakpoint
create index if not exists "marketing_campaign_sending_idx"
  on "marketing_campaign" using btree ("status", "lease_until") where "status" = 'enviando';--> statement-breakpoint
create unique index if not exists "marketing_recipient_campaign_email_uq"
  on "marketing_campaign_recipient" using btree ("campaign_id", "email");--> statement-breakpoint
create index if not exists "marketing_recipient_org_campaign_status_idx"
  on "marketing_campaign_recipient" using btree ("organization_id", "campaign_id", "status", "position");--> statement-breakpoint
create index if not exists "marketing_recipient_org_contact_idx"
  on "marketing_campaign_recipient" using btree ("organization_id", "contact_id");--> statement-breakpoint
create unique index if not exists "marketing_link_campaign_url_uq"
  on "marketing_campaign_link" using btree ("campaign_id", "url");--> statement-breakpoint
create index if not exists "marketing_click_org_campaign_idx"
  on "marketing_click" using btree ("organization_id", "campaign_id");--> statement-breakpoint
create index if not exists "marketing_click_recipient_link_idx"
  on "marketing_click" using btree ("recipient_id", "link_id", "clicked_at");--> statement-breakpoint
create unique index if not exists "marketing_unsub_org_email_active_uq"
  on "marketing_unsubscribe" using btree ("organization_id", "email") where "reverted_at" is null;--> statement-breakpoint
create index if not exists "marketing_unsub_org_contact_idx"
  on "marketing_unsubscribe" using btree ("organization_id", "contact_id");--> statement-breakpoint
create unique index if not exists "marketing_image_public_token_uq"
  on "marketing_image" using btree ("public_token");--> statement-breakpoint
create index if not exists "marketing_image_org_campaign_idx"
  on "marketing_image" using btree ("organization_id", "campaign_id");--> statement-breakpoint

alter table "marketing_settings" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_settings";--> statement-breakpoint
create policy tenant_isolation on "marketing_settings"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "marketing_audience" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_audience";--> statement-breakpoint
create policy tenant_isolation on "marketing_audience"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "marketing_campaign" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_campaign";--> statement-breakpoint
create policy tenant_isolation on "marketing_campaign"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "marketing_campaign_recipient" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_campaign_recipient";--> statement-breakpoint
create policy tenant_isolation on "marketing_campaign_recipient"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "marketing_campaign_link" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_campaign_link";--> statement-breakpoint
create policy tenant_isolation on "marketing_campaign_link"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "marketing_click" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_click";--> statement-breakpoint
create policy tenant_isolation on "marketing_click"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "marketing_unsubscribe" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_unsubscribe";--> statement-breakpoint
create policy tenant_isolation on "marketing_unsubscribe"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "marketing_image" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "marketing_image";--> statement-breakpoint
create policy tenant_isolation on "marketing_image"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

-- Capacidades: una sentencia por rol y capacidad, como la 0063 (el test de la
-- semilla las lee sentencia por sentencia).
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('marketing.ver'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('marketing.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('marketing.ver'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('marketing.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('marketing.ver'),
    "updated_at" = now()
where "key" = 'ventas'
  and not ("capabilities" @> jsonb_build_array('marketing.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('marketing.enviar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('marketing.enviar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('marketing.enviar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('marketing.enviar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('marketing.enviar'),
    "updated_at" = now()
where "key" = 'ventas'
  and not ("capabilities" @> jsonb_build_array('marketing.enviar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('marketing.configurar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('marketing.configurar'));
