-- 2026-10-16 — 035 Accesos grupales y monitoreo de licencias.
--
--   `cohort_group_software` (US1, FR-001..FR-007)
--     Un programa asignado a TODO el grupo de una cohorte, con vencimiento
--     opcional. Esta migración no crea ninguna fila: asignar al grupo es una
--     decisión de la coordinación desde la cohorte, nunca efecto de un deploy.
--
--   `license.source` (FR-003)
--     'grupo' | 'individual'. Las filas existentes quedan 'individual' por el
--     default: todas fueron asignadas a mano, y ninguna cambia de stock.
--
--   Datos de cursos offline (US2, FR-011)
--     Se BORRAN los otorgamientos individuales (`mode = 'grant'`) de un curso
--     que la cohorte de esa inscripción ya tiene asignado al grupo: el alumno
--     conserva el acceso por el grupo, así que nadie pierde nada (SC-005).
--     Las QUITAS individuales (`mode = 'revoke'`) NO se tocan: borrarlas le
--     daría acceso a alguien a quien una persona se lo quitó a propósito. La
--     pantalla las muestra como "Excepción anterior" para que alguien decida.
--
-- Tabla nueva con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no la escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`; el borrado de datos es idempotente (la segunda
-- corrida no encuentra nada que borrar).

create table if not exists "cohort_group_software" (
	"id" text primary key not null,
	"organization_id" text not null,
	"cohort_id" text not null,
	"software_id" text not null,
	"expires_at" timestamp,
	"created_by" text,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

alter table "license" add column if not exists "source" text default 'individual' not null;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'license_source_valido') then
    alter table "license" add constraint "license_source_valido" check ("source" in ('grupo', 'individual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cohort_group_software_organization_id_organization_id_fk') then
    alter table "cohort_group_software" add constraint "cohort_group_software_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cohort_group_software_cohort_id_cohort_id_fk') then
    alter table "cohort_group_software" add constraint "cohort_group_software_cohort_id_cohort_id_fk"
      foreign key ("cohort_id") references "public"."cohort"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cohort_group_software_software_id_software_id_fk') then
    alter table "cohort_group_software" add constraint "cohort_group_software_software_id_software_id_fk"
      foreign key ("software_id") references "public"."software"("id") on delete restrict on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cohort_group_software_created_by_user_id_fk') then
    alter table "cohort_group_software" add constraint "cohort_group_software_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "cohort_group_software_cohort_software_uq" on "cohort_group_software" using btree ("cohort_id","software_id");--> statement-breakpoint
create index if not exists "cohort_group_software_org_idx" on "cohort_group_software" using btree ("organization_id");--> statement-breakpoint

-- FR-011 — Otorgamientos individuales que repiten uno del grupo: fuera.
-- Misma organización en las tres filas (la inscripción, la individual y la
-- del grupo); las quitas (`revoke`) quedan.
delete from "offline_course_access" as individual
using "enrollment" as e, "offline_course_access" as grupo
where individual."mode" = 'grant'
  and individual."enrollment_id" = e."id"
  and e."organization_id" = individual."organization_id"
  and grupo."cohort_id" = e."cohort_id"
  and grupo."offline_course_id" = individual."offline_course_id"
  and grupo."organization_id" = individual."organization_id";--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "cohort_group_software" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "cohort_group_software";--> statement-breakpoint
create policy tenant_isolation on "cohort_group_software"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
