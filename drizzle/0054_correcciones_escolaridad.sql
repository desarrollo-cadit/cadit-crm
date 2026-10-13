-- 2026-10-13 — 031 Correcciones configurables y escolaridad automática.
--
--   `assessment` — la PLANTILLA de corrección (DV-002)
--     `scale` ('pass_fail' | 'numeric'), `min_score`, `requires_approval`,
--     `criteria` y `text_fields` (jsonb). Toda evaluación existente queda
--     'pass_fail', sin mínimo, sin ejercicios y sin aprobación (FR-001): se
--     lee exactamente igual que antes.
--
--   `assessment_result.score`
--     La nota 1–100 de una evaluación numérica (DV-004). `passed` sigue siendo
--     la verdad de aprobación: los once lectores actuales no cambian.
--
--   `correction`
--     Una fila por VERSIÓN de la corrección (DV-001): draft → pending →
--     published, y la publicada anterior pasa a superseded. Dos índices
--     únicos parciales garantizan una sola publicada y una sola en trámite por
--     alumno y evaluación.
--
--   `role.capabilities`
--     `correcciones.aprobar` a `direccion` y `coordinacion` (DV-006). Mismo
--     precedente que la 0052: una capacidad que hasta hoy no existía.
--
-- Tabla nueva con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no la escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; políticas
-- con `drop policy if exists`; el backfill solo toca lo que falta.

alter table "assessment" add column if not exists "scale" text default 'pass_fail' not null;--> statement-breakpoint
alter table "assessment" add column if not exists "min_score" integer;--> statement-breakpoint
alter table "assessment" add column if not exists "requires_approval" boolean default false not null;--> statement-breakpoint
alter table "assessment" add column if not exists "criteria" jsonb default '[]'::jsonb not null;--> statement-breakpoint
alter table "assessment" add column if not exists "text_fields" jsonb default '[]'::jsonb not null;--> statement-breakpoint
alter table "assessment_result" add column if not exists "score" integer;--> statement-breakpoint

create table if not exists "correction" (
	"id" text primary key not null,
	"organization_id" text not null,
	"assessment_id" text not null,
	"enrollment_id" text not null,
	"submission_id" text,
	"status" text not null,
	"score" integer,
	"passed" boolean,
	"feedback" text,
	"criterion_scores" jsonb default '[]'::jsonb not null,
	"text_values" jsonb default '[]'::jsonb not null,
	"corrected_by" text,
	"submitted_by" text,
	"submitted_at" timestamp,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"review_comment" text,
	"published_by" text,
	"published_at" timestamp,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "correction_status_valid" check ("status" in ('draft', 'pending', 'published', 'superseded')),
	constraint "correction_score_range" check ("score" is null or "score" between 0 and 100)
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assessment_scale_valid') then
    alter table "assessment" add constraint "assessment_scale_valid"
      check ("scale" in ('pass_fail', 'numeric'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_min_score_by_scale') then
    alter table "assessment" add constraint "assessment_min_score_by_scale"
      check (("scale" = 'pass_fail' and "min_score" is null) or ("scale" = 'numeric' and "min_score" between 1 and 100));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_result_score_range') then
    alter table "assessment_result" add constraint "assessment_result_score_range"
      check ("score" is null or "score" between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_organization_id_organization_id_fk') then
    alter table "correction" add constraint "correction_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_assessment_id_assessment_id_fk') then
    alter table "correction" add constraint "correction_assessment_id_assessment_id_fk"
      foreign key ("assessment_id") references "public"."assessment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_enrollment_id_enrollment_id_fk') then
    alter table "correction" add constraint "correction_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_submission_id_submission_id_fk') then
    alter table "correction" add constraint "correction_submission_id_submission_id_fk"
      foreign key ("submission_id") references "public"."submission"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_corrected_by_user_id_fk') then
    alter table "correction" add constraint "correction_corrected_by_user_id_fk"
      foreign key ("corrected_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_submitted_by_user_id_fk') then
    alter table "correction" add constraint "correction_submitted_by_user_id_fk"
      foreign key ("submitted_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_reviewed_by_user_id_fk') then
    alter table "correction" add constraint "correction_reviewed_by_user_id_fk"
      foreign key ("reviewed_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'correction_published_by_user_id_fk') then
    alter table "correction" add constraint "correction_published_by_user_id_fk"
      foreign key ("published_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

-- Como mucho UNA publicada y UNA en trámite por alumno y evaluación (DV-001).
create unique index if not exists "correction_vigente_uq" on "correction" using btree ("assessment_id","enrollment_id") where status = 'published';--> statement-breakpoint
create unique index if not exists "correction_en_tramite_uq" on "correction" using btree ("assessment_id","enrollment_id") where status in ('draft', 'pending');--> statement-breakpoint
create index if not exists "correction_org_status_idx" on "correction" using btree ("organization_id","status");--> statement-breakpoint
create index if not exists "correction_org_enrollment_idx" on "correction" using btree ("organization_id","enrollment_id");--> statement-breakpoint

-- La capacidad nueva, a los roles de sistema que ya existen (DV-006).
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('correcciones.aprobar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('correcciones.aprobar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('correcciones.aprobar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('correcciones.aprobar'));--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "correction" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "correction";--> statement-breakpoint
create policy tenant_isolation on "correction"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
