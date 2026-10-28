-- 2026-10-28 — Entrega final del grupo y pedidos de prórroga del alumno.
--
--   1. `cohort.delivery_deadline` (día de calendario, medianoche UTC como
--      `end_date`): la entrega final del grupo. Estrictamente posterior al
--      fin (lo valida `src/lib/entrega-final.ts`). Las evaluaciones sin plazo
--      propio la heredan y el acceso a los contenidos vence un mes después.
--   2. `assessment_extension_request`: el pedido de prórroga del alumno.
--      `pendiente | aprobada | rechazada`; a lo sumo UN pendiente por
--      evaluación e inscripción (índice único parcial). Aprobarlo escribe la
--      `assessment_extension`; un pedido pendiente o rechazado no extiende
--      nada.
--
-- RLS: la tabla nueva nace con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla, columna e
-- índices; FKs dentro de `do $$` contra `pg_constraint`.

alter table "cohort" add column if not exists "delivery_deadline" timestamp;--> statement-breakpoint

create table if not exists "assessment_extension_request" (
	"id" text primary key not null,
	"organization_id" text not null,
	"assessment_id" text not null,
	"enrollment_id" text not null,
	"requested_due_at" timestamp not null,
	"reason" text not null,
	"status" text default 'pendiente' not null,
	"decided_by" text,
	"decided_at" timestamp,
	"decision_note" text,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "assessment_extension_request_status_valid" check ("assessment_extension_request"."status" in ('pendiente', 'aprobada', 'rechazada'))
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_request_organization_id_organization_id_fk') then
    alter table "assessment_extension_request" add constraint "assessment_extension_request_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_request_assessment_id_assessment_id_fk') then
    alter table "assessment_extension_request" add constraint "assessment_extension_request_assessment_id_assessment_id_fk"
      foreign key ("assessment_id") references "public"."assessment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_request_enrollment_id_enrollment_id_fk') then
    alter table "assessment_extension_request" add constraint "assessment_extension_request_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_request_decided_by_user_id_fk') then
    alter table "assessment_extension_request" add constraint "assessment_extension_request_decided_by_user_id_fk"
      foreign key ("decided_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "assessment_extension_request_pendiente_uq" on "assessment_extension_request" using btree ("assessment_id","enrollment_id") where "assessment_extension_request"."status" = 'pendiente';--> statement-breakpoint
create index if not exists "assessment_extension_request_org_status_idx" on "assessment_extension_request" using btree ("organization_id","status");--> statement-breakpoint
create index if not exists "assessment_extension_request_org_enrollment_idx" on "assessment_extension_request" using btree ("organization_id","enrollment_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "assessment_extension_request" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "assessment_extension_request";--> statement-breakpoint
create policy tenant_isolation on "assessment_extension_request"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
