-- 2026-10-15 — 034 Especializaciones en la operación diaria.
--
--   `module_exclusion` (US1, FR-004)
--     "Esta persona no cursa este módulo", decidido por la coordinación. Sin
--     él, la regularización de FR-005 (idempotente) volvería a inscribir a
--     quien se acaba de sacar. Esta migración NO crea ninguna inscripción a
--     módulo: la regularización la ejecuta el dueño desde la especialización.
--
--   `recess` (US2, FR-006..FR-011)
--     Rangos de días sin clase, de la academia (`cohort_id` NULL) o de una
--     cohorte. No mueve ninguna fecha de cohorte ni borra ninguna clase: eso
--     pasa al cargar un receso desde la pantalla, nunca al desplegar.
--
--   `class_session.rescheduled_from_id` (US3, FR-013)
--     La clase cancelada que ésta reprograma. NULL en las clases existentes.
--     Índice único parcial: una cancelada se reprograma una sola vez.
--
--   `license` (US5, FR-020/FR-023)
--     Se cambia `UNIQUE (enrollment_id)` por `UNIQUE (enrollment_id,
--     software_id)`: varias licencias por inscripción, a lo sumo una por
--     programa. Las filas existentes cumplían la regla vieja, así que cumplen
--     la nueva y no se tocan. El índice nuevo se crea ANTES de soltar el
--     viejo para que nunca haya un momento sin unicidad.
--
-- Tablas nuevas con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no la escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`.

create table if not exists "module_exclusion" (
	"id" text primary key not null,
	"organization_id" text not null,
	"parent_enrollment_id" text not null,
	"module_cohort_id" text not null,
	"created_by" text,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "recess" (
	"id" text primary key not null,
	"organization_id" text not null,
	"cohort_id" text,
	"name" text not null,
	"from_date" date not null,
	"to_date" date not null,
	"created_by" text,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

alter table "class_session" add column if not exists "rescheduled_from_id" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recess_rango_valido') then
    alter table "recess" add constraint "recess_rango_valido" check ("to_date" >= "from_date");
  end if;
  if not exists (select 1 from pg_constraint where conname = 'module_exclusion_organization_id_organization_id_fk') then
    alter table "module_exclusion" add constraint "module_exclusion_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'module_exclusion_parent_enrollment_id_enrollment_id_fk') then
    alter table "module_exclusion" add constraint "module_exclusion_parent_enrollment_id_enrollment_id_fk"
      foreign key ("parent_enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'module_exclusion_module_cohort_id_cohort_id_fk') then
    alter table "module_exclusion" add constraint "module_exclusion_module_cohort_id_cohort_id_fk"
      foreign key ("module_cohort_id") references "public"."cohort"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'module_exclusion_created_by_user_id_fk') then
    alter table "module_exclusion" add constraint "module_exclusion_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recess_organization_id_organization_id_fk') then
    alter table "recess" add constraint "recess_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recess_cohort_id_cohort_id_fk') then
    alter table "recess" add constraint "recess_cohort_id_cohort_id_fk"
      foreign key ("cohort_id") references "public"."cohort"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'recess_created_by_user_id_fk') then
    alter table "recess" add constraint "recess_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'class_session_rescheduled_from_id_class_session_id_fk') then
    alter table "class_session" add constraint "class_session_rescheduled_from_id_class_session_id_fk"
      foreign key ("rescheduled_from_id") references "public"."class_session"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "module_exclusion_parent_module_uq" on "module_exclusion" using btree ("parent_enrollment_id","module_cohort_id");--> statement-breakpoint
create index if not exists "module_exclusion_org_module_idx" on "module_exclusion" using btree ("organization_id","module_cohort_id");--> statement-breakpoint
create index if not exists "recess_org_dates_idx" on "recess" using btree ("organization_id","from_date","to_date");--> statement-breakpoint
create index if not exists "recess_org_cohort_idx" on "recess" using btree ("organization_id","cohort_id");--> statement-breakpoint
create unique index if not exists "class_session_rescheduled_from_uq" on "class_session" using btree ("rescheduled_from_id") where "rescheduled_from_id" is not null;--> statement-breakpoint

-- Licencias: primero la unicidad nueva, después se suelta la vieja.
create unique index if not exists "license_enrollment_software_uq" on "license" using btree ("enrollment_id","software_id");--> statement-breakpoint
alter table "license" drop constraint if exists "license_enrollment_id_unique";--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "module_exclusion" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "module_exclusion";--> statement-breakpoint
create policy tenant_isolation on "module_exclusion"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "recess" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "recess";--> statement-breakpoint
create policy tenant_isolation on "recess"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
