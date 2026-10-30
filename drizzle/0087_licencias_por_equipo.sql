-- 2026-10-30 — Licencias por equipo (Uruguay ATC, Paraguay ATC…).
--
-- Hasta acá el stock era UNO por programa (`software.total_licenses`). En
-- Autodesk cada equipo tiene su propio cupo por producto, así que:
--
--   1. `license_team`        el equipo (nombre + alias de Autodesk).
--   2. `license_team_seat`   el cupo de un programa en un equipo.
--   3. `license.team_id`     de qué equipo sale cada asiento.
--   4. `cohort_group_software.team_id`  el equipo de las licencias de un grupo,
--      elegido una vez al asignar el programa al grupo.
--
-- BACKFILL: cada organización con programas recibe UN equipo «Sin asignar»
-- (solo si no tiene ninguno); ahí caen todas las licencias y los programas de
-- grupo existentes, y sus cupos son los `total_licenses` de hoy. Así el stock
-- disponible no cambia ni un número hasta que alguien reparta los equipos.
-- `software.total_licenses` queda como columna heredada: nada la lee.
--
-- RLS: las tablas nuevas nacen con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs dentro de `do $$` contra `pg_constraint`; el backfill solo toca
-- lo que todavía no tiene equipo y los cupos con `on conflict do nothing`.

create table if not exists "license_team" (
	"id" text primary key not null,
	"organization_id" text not null,
	"name" text not null,
	"autodesk_alias" text,
	"archived_at" timestamp,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "license_team_seat" (
	"organization_id" text not null,
	"team_id" text not null,
	"software_id" text not null,
	"total" integer default 0 not null,
	"updated_at" timestamp default now() not null,
	constraint "license_team_seat_team_id_software_id_pk" primary key("team_id","software_id"),
	constraint "license_team_seat_total_valido" check ("license_team_seat"."total" >= 0)
);--> statement-breakpoint

alter table "license" add column if not exists "team_id" text;--> statement-breakpoint
alter table "cohort_group_software" add column if not exists "team_id" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'license_team_organization_id_organization_id_fk') then
    alter table "license_team" add constraint "license_team_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'license_team_seat_organization_id_organization_id_fk') then
    alter table "license_team_seat" add constraint "license_team_seat_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'license_team_seat_team_id_license_team_id_fk') then
    alter table "license_team_seat" add constraint "license_team_seat_team_id_license_team_id_fk"
      foreign key ("team_id") references "public"."license_team"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'license_team_seat_software_id_software_id_fk') then
    alter table "license_team_seat" add constraint "license_team_seat_software_id_software_id_fk"
      foreign key ("software_id") references "public"."software"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cohort_group_software_team_id_license_team_id_fk') then
    alter table "cohort_group_software" add constraint "cohort_group_software_team_id_license_team_id_fk"
      foreign key ("team_id") references "public"."license_team"("id") on delete restrict on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'license_team_id_license_team_id_fk') then
    alter table "license" add constraint "license_team_id_license_team_id_fk"
      foreign key ("team_id") references "public"."license_team"("id") on delete restrict on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "license_team_org_name_uq" on "license_team" using btree ("organization_id","name");--> statement-breakpoint
create index if not exists "license_team_org_idx" on "license_team" using btree ("organization_id");--> statement-breakpoint
create index if not exists "license_team_seat_org_idx" on "license_team_seat" using btree ("organization_id");--> statement-breakpoint
create index if not exists "license_team_seat_software_idx" on "license_team_seat" using btree ("software_id");--> statement-breakpoint
create index if not exists "license_team_idx" on "license" using btree ("team_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "license_team" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_team";--> statement-breakpoint
create policy tenant_isolation on "license_team"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "license_team_seat" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_team_seat";--> statement-breakpoint
create policy tenant_isolation on "license_team_seat"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

-- BACKFILL 1/3 — el equipo «Sin asignar» de cada organización con programas
-- que todavía no tiene ningún equipo.
insert into "license_team" ("id", "organization_id", "name")
select 'ltm_' || substr(md5(random()::text || clock_timestamp()::text || o."id"), 1, 20), o."id", 'Sin asignar'
from "organization" o
where exists (select 1 from "software" s where s."organization_id" = o."id")
  and not exists (select 1 from "license_team" t where t."organization_id" = o."id");--> statement-breakpoint

-- BACKFILL 2/3 — el cupo de hoy de cada programa pasa a ese equipo. Si el
-- cupo ya existe (re-ejecución) no se pisa lo que alguien haya editado.
insert into "license_team_seat" ("organization_id", "team_id", "software_id", "total")
select s."organization_id", t."id", s."id", s."total_licenses"
from "software" s
join lateral (
  select "id" from "license_team" where "organization_id" = s."organization_id"
  order by "created_at", "id" limit 1
) t on true
on conflict ("team_id", "software_id") do nothing;--> statement-breakpoint

-- BACKFILL 3/3 — toda licencia y todo programa de grupo existente, al equipo.
update "license" l
set "team_id" = (
  select t."id" from "license_team" t
  where t."organization_id" = l."organization_id"
  order by t."created_at", t."id" limit 1
)
where l."team_id" is null;--> statement-breakpoint
update "cohort_group_software" g
set "team_id" = (
  select t."id" from "license_team" t
  where t."organization_id" = g."organization_id"
  order by t."created_at", t."id" limit 1
)
where g."team_id" is null;--> statement-breakpoint

alter table "license" alter column "team_id" set not null;--> statement-breakpoint
alter table "cohort_group_software" alter column "team_id" set not null;
