-- 2026-10-29 — Consigna, rúbrica, avisos al alumno y evaluaciones modelo del curso.
--
--   1. `assessment.instructions_md`: la consigna (gramática en línea, nunca HTML).
--      No se congela.
--   2. `resource.assessment_id` y `resource.course_assessment_template_id`: los
--      adjuntos de la consigna son material con contenedor propio; el CHECK
--      `resource_contenedor_unico` pasa de 3 a 5 contenedores (siempre uno).
--   3. `course_assessment_template`: las evaluaciones MODELO de un curso. Un
--      grupo las toma (copia, nunca hereda).
--   4. `assessment_notice`: los correos al alumno (recordatorio antes del plazo,
--      corrección publicada), idempotentes por `dedup_key` única por organización.
--
-- La rúbrica (niveles por criterio) y el nivel elegido al corregir viven en los
-- jsonb que ya existen (`criteria`, `criterion_scores`): no necesitan columna.
--
-- RLS: las dos tablas nuevas nacen con `tenant_isolation` (`db:generate` no
-- genera políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e índices;
-- FKs dentro de `do $$` contra `pg_constraint`; el CHECK se reemplaza con
-- `drop ... if exists`.

alter table "assessment" add column if not exists "instructions_md" text default '' not null;--> statement-breakpoint

create table if not exists "course_assessment_template" (
	"id" text primary key not null,
	"organization_id" text not null,
	"course_id" text not null,
	"name" text not null,
	"position" integer default 0 not null,
	"required" boolean default true not null,
	"instructions_md" text default '' not null,
	"scale" text default 'pass_fail' not null,
	"min_score" integer,
	"requires_approval" boolean default false not null,
	"criteria" jsonb default '[]'::jsonb not null,
	"text_fields" jsonb default '[]'::jsonb not null,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "course_assessment_template_scale_valid" check ("course_assessment_template"."scale" in ('pass_fail', 'numeric')),
	constraint "course_assessment_template_min_score_by_scale" check (("course_assessment_template"."scale" = 'pass_fail' and "course_assessment_template"."min_score" is null) or ("course_assessment_template"."scale" = 'numeric' and "course_assessment_template"."min_score" between 1 and 100))
);--> statement-breakpoint

create table if not exists "assessment_notice" (
	"id" text primary key not null,
	"organization_id" text not null,
	"kind" text not null,
	"assessment_id" text not null,
	"enrollment_id" text not null,
	"correction_id" text,
	"due_at" timestamp,
	"dedup_key" text not null,
	"status" text not null,
	"attempts" integer default 1 not null,
	"error" text,
	"sent_at" timestamp,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "assessment_notice_kind_valid" check ("assessment_notice"."kind" in ('recordatorio','correccion_publicada')),
	constraint "assessment_notice_status_valid" check ("assessment_notice"."status" in ('enviando','enviado','fallido','omitido'))
);--> statement-breakpoint

alter table "resource" add column if not exists "assessment_id" text;--> statement-breakpoint
alter table "resource" add column if not exists "course_assessment_template_id" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'course_assessment_template_organization_id_organization_id_fk') then
    alter table "course_assessment_template" add constraint "course_assessment_template_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_assessment_template_course_id_course_id_fk') then
    alter table "course_assessment_template" add constraint "course_assessment_template_course_id_course_id_fk"
      foreign key ("course_id") references "public"."course"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_notice_organization_id_organization_id_fk') then
    alter table "assessment_notice" add constraint "assessment_notice_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_notice_assessment_id_assessment_id_fk') then
    alter table "assessment_notice" add constraint "assessment_notice_assessment_id_assessment_id_fk"
      foreign key ("assessment_id") references "public"."assessment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_notice_enrollment_id_enrollment_id_fk') then
    alter table "assessment_notice" add constraint "assessment_notice_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_notice_correction_id_correction_id_fk') then
    alter table "assessment_notice" add constraint "assessment_notice_correction_id_correction_id_fk"
      foreign key ("correction_id") references "public"."correction"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'resource_assessment_id_assessment_id_fk') then
    alter table "resource" add constraint "resource_assessment_id_assessment_id_fk"
      foreign key ("assessment_id") references "public"."assessment"("id") on delete cascade on update no action;
  end if;
  -- Postgres trunca los identificadores a 63 caracteres: se busca el truncado.
  if not exists (select 1 from pg_constraint where conname = left('resource_course_assessment_template_id_course_assessment_template_id_fk', 63)) then
    alter table "resource" add constraint "resource_course_assessment_template_id_course_assessment_template_id_fk"
      foreign key ("course_assessment_template_id") references "public"."course_assessment_template"("id") on delete cascade on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "assessment_notice_org_dedup_uq" on "assessment_notice" using btree ("organization_id","dedup_key");--> statement-breakpoint
create index if not exists "assessment_notice_org_assessment_idx" on "assessment_notice" using btree ("organization_id","assessment_id");--> statement-breakpoint
create index if not exists "course_assessment_template_org_course_idx" on "course_assessment_template" using btree ("organization_id","course_id","position");--> statement-breakpoint
create index if not exists "resource_org_assessment_idx" on "resource" using btree ("organization_id","assessment_id");--> statement-breakpoint
create index if not exists "resource_org_course_assessment_template_idx" on "resource" using btree ("organization_id","course_assessment_template_id");--> statement-breakpoint

-- Exactamente UN contenedor, ahora entre cinco.
alter table "resource" drop constraint if exists "resource_contenedor_unico";--> statement-breakpoint
alter table "resource" add constraint "resource_contenedor_unico" check ((case when "resource"."course_id" is not null then 1 else 0 end)
        + (case when "resource"."cohort_id" is not null then 1 else 0 end)
        + (case when "resource"."class_session_id" is not null then 1 else 0 end)
        + (case when "resource"."assessment_id" is not null then 1 else 0 end)
        + (case when "resource"."course_assessment_template_id" is not null then 1 else 0 end) = 1);--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "course_assessment_template" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "course_assessment_template";--> statement-breakpoint
create policy tenant_isolation on "course_assessment_template"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint
alter table "assessment_notice" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "assessment_notice";--> statement-breakpoint
create policy tenant_isolation on "assessment_notice"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
