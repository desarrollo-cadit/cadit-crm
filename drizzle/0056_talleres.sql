-- 2026-10-15 — 033 Talleres.
--
--   Un taller es un curso de tipo 'taller' (032), cada edición es una
--   cohorte y cada persona anotada es una inscripción: la cobranza y
--   Finanzas cuelgan de `enrollment`, así que no se construye nada paralelo.
--
--   `cohort.modality` ('online' | 'presencial') y
--   `cohort.registration_status` ('abierta' | 'cerrada' | 'cancelada')
--     Solo los usa una edición de taller (FR-002). NULL en toda cohorte de
--     curso: las 41 existentes se leen exactamente igual que antes.
--
--   `workshop_registration`
--     1:1 con la inscripción: estado (anotado → confirmado → asistió / no
--     asistió, o cancelado), origen (web | manual), monto pactado y la marca
--     de los avisos por WhatsApp.
--
-- Tabla nueva con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no la escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`.

alter table "cohort" add column if not exists "modality" text;--> statement-breakpoint
alter table "cohort" add column if not exists "registration_status" text;--> statement-breakpoint

create table if not exists "workshop_registration" (
	"id" text primary key not null,
	"organization_id" text not null,
	"enrollment_id" text not null,
	"status" text default 'anotado' not null,
	"source" text not null,
	"amount" integer,
	"currency" text,
	"confirmation_sent_at" timestamp,
	"reminder_sent_at" timestamp,
	"last_notify_error" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cohort_modality_valid') then
    alter table "cohort" add constraint "cohort_modality_valid"
      check ("modality" is null or "modality" in ('online', 'presencial'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'cohort_registration_status_valid') then
    alter table "cohort" add constraint "cohort_registration_status_valid"
      check ("registration_status" is null or "registration_status" in ('abierta', 'cerrada', 'cancelada'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workshop_registration_status_valid') then
    alter table "workshop_registration" add constraint "workshop_registration_status_valid"
      check ("status" in ('anotado', 'confirmado', 'asistio', 'no_asistio', 'cancelado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workshop_registration_source_valid') then
    alter table "workshop_registration" add constraint "workshop_registration_source_valid"
      check ("source" in ('web', 'manual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workshop_registration_organization_id_organization_id_fk') then
    alter table "workshop_registration" add constraint "workshop_registration_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'workshop_registration_enrollment_id_enrollment_id_fk') then
    alter table "workshop_registration" add constraint "workshop_registration_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "workshop_registration_enrollment_uq" on "workshop_registration" using btree ("enrollment_id");--> statement-breakpoint
create index if not exists "workshop_registration_org_status_idx" on "workshop_registration" using btree ("organization_id","status");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "workshop_registration" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "workshop_registration";--> statement-breakpoint
create policy tenant_isolation on "workshop_registration"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
