-- 2026-10-23 — 046 US6: importar el historial 2020–2024 desde la app.
--
--   `historical_import_batch`   una importación: quién, cuándo, asociaciones,
--                               avance por tandas y resultado. `pending_rows`
--                               se vacía al terminar o deshacer.
--   `historical_course_taking`  una cursada de la planilla. NO es una
--                               inscripción ni un grupo: el historial
--                               comercial la cuenta como "cursó (registro
--                               histórico)", nunca como "aprobó".
--
--   Reglas que garantiza la base:
--     `historical_course_taking_org_dedup_uq`  reimportar no duplica (FR-019)
--     `historical_import_batch_status_valid`   estados cerrados
--
--   Capacidad `historial.importar` al rol de sistema `direccion`, por llave
--   (FR-022). Los demás roles no la reciben; el dueño la reparte si quiere.
--
-- RLS: las dos nacen con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas e índices; FKs y
-- CHECK dentro de `do $$` contra `pg_constraint`; políticas con
-- `drop policy if exists`; capacidad con `where not (… @> …)`.

create table if not exists "historical_import_batch" (
	"id" text primary key not null,
	"organization_id" text not null,
	"source_label" text not null,
	"file_name" text,
	"status" text default 'aplicando' not null,
	"mapping" jsonb not null,
	"pending_rows" jsonb,
	"total_rows" integer default 0 not null,
	"processed_rows" integer default 0 not null,
	"problem_rows" integer default 0 not null,
	"contacts_created" integer default 0 not null,
	"contacts_completed" integer default 0 not null,
	"companies_created" integer default 0 not null,
	"takings_created" integer default 0 not null,
	"takings_existing" integer default 0 not null,
	"imported_by" text,
	"undone_by" text,
	"created_at" timestamp default now() not null,
	"finished_at" timestamp,
	"undone_at" timestamp
);--> statement-breakpoint

create table if not exists "historical_course_taking" (
	"id" text primary key not null,
	"organization_id" text not null,
	"contact_id" text not null,
	"course_id" text,
	"course_label" text not null,
	"original_label" text,
	"taken_on" timestamp not null,
	"company_id" text,
	"seller_id" text,
	"is_student" boolean default false not null,
	"edition" text,
	"note" text,
	"source_label" text not null,
	"source_row" integer,
	"batch_id" text not null,
	"dedup_key" text not null,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'historical_import_batch_status_valid') then
    alter table "historical_import_batch" add constraint "historical_import_batch_status_valid"
      check ("status" in ('aplicando', 'aplicada', 'deshecha'));
  end if;
  -- historical_import_batch
  if not exists (select 1 from pg_constraint where conname = 'historical_import_batch_organization_id_organization_id_fk') then
    alter table "historical_import_batch" add constraint "historical_import_batch_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'historical_import_batch_imported_by_user_id_fk') then
    alter table "historical_import_batch" add constraint "historical_import_batch_imported_by_user_id_fk"
      foreign key ("imported_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'historical_import_batch_undone_by_user_id_fk') then
    alter table "historical_import_batch" add constraint "historical_import_batch_undone_by_user_id_fk"
      foreign key ("undone_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  -- historical_course_taking
  if not exists (select 1 from pg_constraint where conname = 'historical_course_taking_organization_id_organization_id_fk') then
    alter table "historical_course_taking" add constraint "historical_course_taking_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'historical_course_taking_contact_id_contact_id_fk') then
    alter table "historical_course_taking" add constraint "historical_course_taking_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'historical_course_taking_course_id_course_id_fk') then
    alter table "historical_course_taking" add constraint "historical_course_taking_course_id_course_id_fk"
      foreign key ("course_id") references "public"."course"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'historical_course_taking_company_id_company_id_fk') then
    alter table "historical_course_taking" add constraint "historical_course_taking_company_id_company_id_fk"
      foreign key ("company_id") references "public"."company"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'historical_course_taking_seller_id_seller_id_fk') then
    alter table "historical_course_taking" add constraint "historical_course_taking_seller_id_seller_id_fk"
      foreign key ("seller_id") references "public"."seller"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'historical_course_taking_batch_id_historical_import_batch_id_fk') then
    alter table "historical_course_taking" add constraint "historical_course_taking_batch_id_historical_import_batch_id_fk"
      foreign key ("batch_id") references "public"."historical_import_batch"("id") on delete cascade on update no action;
  end if;
end $$;--> statement-breakpoint

create index if not exists "historical_import_batch_org_created_idx"
  on "historical_import_batch" using btree ("organization_id", "created_at");--> statement-breakpoint
create unique index if not exists "historical_course_taking_org_dedup_uq"
  on "historical_course_taking" using btree ("organization_id", "dedup_key");--> statement-breakpoint
create index if not exists "historical_course_taking_org_contact_idx"
  on "historical_course_taking" using btree ("organization_id", "contact_id");--> statement-breakpoint
create index if not exists "historical_course_taking_org_batch_idx"
  on "historical_course_taking" using btree ("organization_id", "batch_id");--> statement-breakpoint

alter table "historical_import_batch" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "historical_import_batch";--> statement-breakpoint
create policy tenant_isolation on "historical_import_batch"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "historical_course_taking" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "historical_course_taking";--> statement-breakpoint
create policy tenant_isolation on "historical_course_taking"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('historial.importar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('historial.importar'));
