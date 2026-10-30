-- 2026-10-30 — Conciliar las licencias con Autodesk (importar el Excel de usuarios).
--
-- Seis tablas, todas de dominio (con `organization_id`):
--
--   1. `license_import_batch`    una importación del Excel de UN equipo (la foto
--                                de un día); se conservan las últimas 6 por equipo.
--   2. `license_import_row`      una fila por (correo, programa) de esa foto.
--   3. `license_offering_map`    qué programa del campus es cada oferta de
--                                Autodesk (NULL = «no se gestiona»).
--   4. `license_email_alias`     «este correo de Autodesk es esta persona».
--   5. `license_case_resolution` decisiones sobre un caso (mantener / omitir),
--                                válidas mientras no cambie su `fingerprint`.
--   6. `license_autodesk_task`   lo que hay que hacer en manage.autodesk.com;
--                                se cierra sola con la próxima importación.
--
-- Sin backfill: las tablas nacen vacías y nada del stock cambia hasta que
-- alguien importe un archivo.
--
-- RLS: las seis nacen con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas e índices; las FKs
-- dentro de un `do $$` contra `pg_constraint`; políticas con `drop ... if exists`.

create table if not exists "license_import_batch" (
	"id" text primary key not null,
	"organization_id" text not null,
	"team_id" text not null,
	"file_name" text not null,
	"uploaded_by" text,
	"uploaded_at" timestamp default now() not null,
	"people" integer default 0 not null,
	"people_without_license" integer default 0 not null,
	"licenses" integer default 0 not null,
	"ignored" integer default 0 not null
);--> statement-breakpoint

create table if not exists "license_import_row" (
	"id" text primary key not null,
	"organization_id" text not null,
	"batch_id" text not null,
	"team_id" text not null,
	"software_id" text not null,
	"email" text not null,
	"first_name" text default '' not null,
	"last_name" text default '' not null,
	"autodesk_id" text default '' not null,
	"offering_name" text not null,
	"role" text default '' not null,
	"account_status" text default '' not null
);--> statement-breakpoint

create table if not exists "license_offering_map" (
	"organization_id" text not null,
	"offering_key" text not null,
	"offering_name" text not null,
	"software_id" text,
	"updated_at" timestamp default now() not null,
	constraint "license_offering_map_organization_id_offering_key_pk" primary key("organization_id","offering_key")
);--> statement-breakpoint

create table if not exists "license_email_alias" (
	"id" text primary key not null,
	"organization_id" text not null,
	"email" text not null,
	"contact_id" text,
	"teacher_id" text,
	"created_by" text,
	"created_at" timestamp default now() not null,
	constraint "license_email_alias_una_persona" check (num_nonnulls("license_email_alias"."contact_id", "license_email_alias"."teacher_id") = 1)
);--> statement-breakpoint

create table if not exists "license_case_resolution" (
	"id" text primary key not null,
	"organization_id" text not null,
	"team_id" text not null,
	"software_id" text not null,
	"subject" text not null,
	"decision" text not null,
	"note" text,
	"fingerprint" text not null,
	"resolved_by" text,
	"resolved_at" timestamp default now() not null,
	constraint "license_case_resolution_decision_valida" check ("license_case_resolution"."decision" in ('mantener', 'omitir'))
);--> statement-breakpoint

create table if not exists "license_autodesk_task" (
	"id" text primary key not null,
	"organization_id" text not null,
	"team_id" text not null,
	"software_id" text not null,
	"kind" text not null,
	"status" text default 'abierta' not null,
	"subject" text not null,
	"email" text,
	"contact_id" text,
	"teacher_id" text,
	"person_name" text,
	"created_by" text,
	"created_at" timestamp default now() not null,
	"closed_at" timestamp,
	"closed_by_batch_id" text,
	constraint "license_autodesk_task_kind_valido" check ("license_autodesk_task"."kind" in ('asignar_en_autodesk', 'sacar_en_autodesk')),
	constraint "license_autodesk_task_status_valido" check ("license_autodesk_task"."status" in ('abierta', 'cerrada'))
);--> statement-breakpoint

-- Claves foráneas: una sola lista, cada una solo si todavía no existe.
do $$
declare f record;
begin
  for f in
    select * from (values
      ('license_import_batch', 'license_import_batch_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('license_import_batch', 'license_import_batch_team_id_license_team_id_fk', 'team_id', 'license_team', 'cascade'),
      ('license_import_batch', 'license_import_batch_uploaded_by_user_id_fk', 'uploaded_by', 'user', 'set null'),
      ('license_import_row', 'license_import_row_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('license_import_row', 'license_import_row_batch_id_license_import_batch_id_fk', 'batch_id', 'license_import_batch', 'cascade'),
      ('license_import_row', 'license_import_row_team_id_license_team_id_fk', 'team_id', 'license_team', 'cascade'),
      ('license_import_row', 'license_import_row_software_id_software_id_fk', 'software_id', 'software', 'cascade'),
      ('license_offering_map', 'license_offering_map_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('license_offering_map', 'license_offering_map_software_id_software_id_fk', 'software_id', 'software', 'cascade'),
      ('license_email_alias', 'license_email_alias_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('license_email_alias', 'license_email_alias_contact_id_contact_id_fk', 'contact_id', 'contact', 'cascade'),
      ('license_email_alias', 'license_email_alias_teacher_id_teacher_id_fk', 'teacher_id', 'teacher', 'cascade'),
      ('license_email_alias', 'license_email_alias_created_by_user_id_fk', 'created_by', 'user', 'set null'),
      ('license_case_resolution', 'license_case_resolution_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('license_case_resolution', 'license_case_resolution_team_id_license_team_id_fk', 'team_id', 'license_team', 'cascade'),
      ('license_case_resolution', 'license_case_resolution_software_id_software_id_fk', 'software_id', 'software', 'cascade'),
      ('license_case_resolution', 'license_case_resolution_resolved_by_user_id_fk', 'resolved_by', 'user', 'set null'),
      ('license_autodesk_task', 'license_autodesk_task_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('license_autodesk_task', 'license_autodesk_task_team_id_license_team_id_fk', 'team_id', 'license_team', 'cascade'),
      ('license_autodesk_task', 'license_autodesk_task_software_id_software_id_fk', 'software_id', 'software', 'cascade'),
      ('license_autodesk_task', 'license_autodesk_task_contact_id_contact_id_fk', 'contact_id', 'contact', 'set null'),
      ('license_autodesk_task', 'license_autodesk_task_teacher_id_teacher_id_fk', 'teacher_id', 'teacher', 'set null'),
      ('license_autodesk_task', 'license_autodesk_task_created_by_user_id_fk', 'created_by', 'user', 'set null'),
      ('license_autodesk_task', 'license_autodesk_task_closed_by_batch_id_license_import_batch_id_fk', 'closed_by_batch_id', 'license_import_batch', 'set null')
    ) as t(tabla, nombre, columna, referida, accion)
  loop
    if not exists (select 1 from pg_constraint where conname = f.nombre) then
      execute format(
        'alter table %I add constraint %I foreign key (%I) references public.%I("id") on delete %s on update no action',
        f.tabla, f.nombre, f.columna, f.referida, f.accion
      );
    end if;
  end loop;
end $$;--> statement-breakpoint

create index if not exists "license_import_batch_org_idx" on "license_import_batch" using btree ("organization_id");--> statement-breakpoint
create index if not exists "license_import_batch_team_idx" on "license_import_batch" using btree ("team_id","uploaded_at");--> statement-breakpoint
create unique index if not exists "license_import_row_batch_email_software_uq" on "license_import_row" using btree ("batch_id","email","software_id");--> statement-breakpoint
create index if not exists "license_import_row_org_idx" on "license_import_row" using btree ("organization_id");--> statement-breakpoint
create index if not exists "license_import_row_team_software_idx" on "license_import_row" using btree ("team_id","software_id");--> statement-breakpoint
create unique index if not exists "license_email_alias_org_email_uq" on "license_email_alias" using btree ("organization_id","email");--> statement-breakpoint
create unique index if not exists "license_case_resolution_case_uq" on "license_case_resolution" using btree ("team_id","software_id","subject");--> statement-breakpoint
create index if not exists "license_case_resolution_org_idx" on "license_case_resolution" using btree ("organization_id");--> statement-breakpoint
create index if not exists "license_autodesk_task_org_idx" on "license_autodesk_task" using btree ("organization_id");--> statement-breakpoint
create index if not exists "license_autodesk_task_team_idx" on "license_autodesk_task" using btree ("team_id","status");--> statement-breakpoint
create unique index if not exists "license_autodesk_task_abierta_uq" on "license_autodesk_task" using btree ("team_id","software_id","kind","subject") where "license_autodesk_task"."status" = 'abierta';--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "license_import_batch" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_import_batch";--> statement-breakpoint
create policy tenant_isolation on "license_import_batch"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "license_import_row" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_import_row";--> statement-breakpoint
create policy tenant_isolation on "license_import_row"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "license_offering_map" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_offering_map";--> statement-breakpoint
create policy tenant_isolation on "license_offering_map"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "license_email_alias" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_email_alias";--> statement-breakpoint
create policy tenant_isolation on "license_email_alias"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "license_case_resolution" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_case_resolution";--> statement-breakpoint
create policy tenant_isolation on "license_case_resolution"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "license_autodesk_task" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "license_autodesk_task";--> statement-breakpoint
create policy tenant_isolation on "license_autodesk_task"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
