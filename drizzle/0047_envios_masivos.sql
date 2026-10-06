-- 2026-10-05 — Envío masivo por cohorte (términos ATC, bienvenida al grupo,
-- acceso al portal) y la marca de "correo de acceso enviado".
--
--   `bulk_send_run` / `bulk_send_recipient`
--     El registro de cada corrida y de qué pasó con cada destinatario, para
--     mostrar el avance y los fallos después de recargar. NO es la fuente de
--     verdad de "ya se le mandó": eso son las marcas por persona.
--
--   `account_link.invitation_email_sent_at` / `invitation_email_sent_by`
--     Cuándo Graph aceptó el último correo de acceso de la cuenta, y quién lo
--     pidió. Columnas nuevas, nullable, sin relleno: los vínculos anteriores
--     quedan sin marca, y el envío masivo los saltea igual porque ya tienen
--     vínculo.
--
-- Las dos tablas nuevas llevan `organization_id`: RLS + `tenant_isolation`
-- a mano (db:generate no las escribe). `account_link` sigue fuera de RLS a
-- propósito (ver rls-cobertura.test.ts). Los permisos de `cadit_app` los
-- cubre el `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; las FK dentro de un `do $$` que consulta `pg_constraint`; la
-- política se borra antes de crearse. Se aplica una vez como `postgres` al
-- arrancar el contenedor.

create table if not exists "bulk_send_run" (
  "id" text primary key not null,
  "organization_id" text not null,
  "cohort_id" text not null,
  "kind" text not null,
  "started_by" text,
  "started_at" timestamp DEFAULT now() NOT NULL,
  "finished_at" timestamp
);--> statement-breakpoint

create table if not exists "bulk_send_recipient" (
  "id" text primary key not null,
  "organization_id" text not null,
  "run_id" text not null,
  "enrollment_id" text not null,
  "position" integer not null,
  "outcome" text DEFAULT 'pending' NOT NULL,
  "message" text,
  "processed_at" timestamp
);--> statement-breakpoint

alter table "account_link" add column if not exists "invitation_email_sent_at" timestamp;--> statement-breakpoint
alter table "account_link" add column if not exists "invitation_email_sent_by" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bulk_send_run_organization_id_organization_id_fk') then
    alter table "bulk_send_run" add constraint "bulk_send_run_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bulk_send_run_cohort_id_cohort_id_fk') then
    alter table "bulk_send_run" add constraint "bulk_send_run_cohort_id_cohort_id_fk"
      foreign key ("cohort_id") references "public"."cohort"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bulk_send_run_started_by_user_id_fk') then
    alter table "bulk_send_run" add constraint "bulk_send_run_started_by_user_id_fk"
      foreign key ("started_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bulk_send_recipient_organization_id_organization_id_fk') then
    alter table "bulk_send_recipient" add constraint "bulk_send_recipient_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bulk_send_recipient_run_id_bulk_send_run_id_fk') then
    alter table "bulk_send_recipient" add constraint "bulk_send_recipient_run_id_bulk_send_run_id_fk"
      foreign key ("run_id") references "public"."bulk_send_run"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'bulk_send_recipient_enrollment_id_enrollment_id_fk') then
    alter table "bulk_send_recipient" add constraint "bulk_send_recipient_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'account_link_invitation_email_sent_by_user_id_fk') then
    alter table "account_link" add constraint "account_link_invitation_email_sent_by_user_id_fk"
      foreign key ("invitation_email_sent_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create index if not exists "bulk_send_run_org_cohort_idx" on "bulk_send_run" using btree ("organization_id","cohort_id","kind");--> statement-breakpoint
create index if not exists "bulk_send_recipient_org_run_idx" on "bulk_send_recipient" using btree ("organization_id","run_id","position");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "bulk_send_run" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "bulk_send_run";--> statement-breakpoint
create policy tenant_isolation on "bulk_send_run"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "bulk_send_recipient" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "bulk_send_recipient";--> statement-breakpoint
create policy tenant_isolation on "bulk_send_recipient"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
