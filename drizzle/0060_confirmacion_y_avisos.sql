-- 2026-10-19 — 039 Confirmación de cohortes y avisos internos por correo.
--
--   `cohort.confirmed_at` / `cohort.confirmed_by`
--     La cohorte "sale". NULL en todas las filas existentes (sin confirmar).
--     No es un valor más de `cohort.status`: confirmar es ortogonal a las
--     fechas (una cohorte `planificada` puede estar confirmada).
--
--   `area_config.area` admite `administracion`
--     Solo para los avisos internos de facturación. El CHECK se reemplaza;
--     `area_config_sellers_only_ventas` no cambia (las copias de vendedores
--     siguen siendo solo de Ventas) y `area_handoff` no se toca: el agente no
--     deriva a Administración.
--
--   `staff_notice`
--     Un aviso por organización, cohorte y tipo (UNIQUE): la llave de la
--     idempotencia de `cohorte_confirmada`, `facturacion_t7` y
--     `facturacion_t2`.
--
--   `role.capabilities`
--     `cohortes.confirmar` a `direccion` y `coordinacion`. Mismo precedente
--     que la 0054: una capacidad que hasta hoy no existía.
--
-- Tabla nueva con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no la escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`; el backfill solo toca lo que falta.

alter table "cohort" add column if not exists "confirmed_at" timestamp;--> statement-breakpoint
alter table "cohort" add column if not exists "confirmed_by" text;--> statement-breakpoint

create table if not exists "staff_notice" (
	"id" text primary key not null,
	"organization_id" text not null,
	"cohort_id" text not null,
	"kind" text not null,
	"status" text not null,
	"recipients" jsonb default '{"to":[],"cc":[]}'::jsonb not null,
	"subject" text,
	"detail" text,
	"error" text,
	"attempts" integer default 0 not null,
	"claimed_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "staff_notice_kind_valid" check ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2')),
	constraint "staff_notice_status_valid" check ("status" in ('pending', 'sent', 'skipped', 'failed', 'cancelled'))
);--> statement-breakpoint

do $$
begin
  -- El CHECK de áreas se reemplaza: suma `administracion`. Se compara contra
  -- la definición para que una segunda corrida no lo toque.
  if exists (
    select 1 from pg_constraint
    where conname = 'area_config_area_valid'
      and pg_get_constraintdef(oid) not like '%administracion%'
  ) then
    alter table "area_config" drop constraint "area_config_area_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_config_area_valid') then
    alter table "area_config" add constraint "area_config_area_valid"
      check ("area" in ('ventas', 'soporte', 'administracion'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cohort_confirmed_by_user_id_fk') then
    alter table "cohort" add constraint "cohort_confirmed_by_user_id_fk"
      foreign key ("confirmed_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_organization_id_organization_id_fk') then
    alter table "staff_notice" add constraint "staff_notice_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_cohort_id_cohort_id_fk') then
    alter table "staff_notice" add constraint "staff_notice_cohort_id_cohort_id_fk"
      foreign key ("cohort_id") references "public"."cohort"("id") on delete cascade on update no action;
  end if;
end $$;--> statement-breakpoint

-- UNO por organización, cohorte y tipo: un reinicio o dos procesos no duplican.
create unique index if not exists "staff_notice_org_cohort_kind_uq" on "staff_notice" using btree ("organization_id","cohort_id","kind");--> statement-breakpoint
create index if not exists "staff_notice_org_status_idx" on "staff_notice" using btree ("organization_id","status");--> statement-breakpoint

-- La capacidad nueva, a los roles de sistema que ya existen.
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cohortes.confirmar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('cohortes.confirmar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cohortes.confirmar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('cohortes.confirmar'));--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "staff_notice" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "staff_notice";--> statement-breakpoint
create policy tenant_isolation on "staff_notice"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
