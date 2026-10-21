-- 2026-10-21 — Seguimiento de leads (pestaña «Seguimiento» del contacto).
--
--   `contact_form_submission`: cada envío de un formulario PÚBLICO, tal como
--     llegó (append-only). Lo escriben `registerPublicLead` y
--     `submitPublicWorkshopRegistration` en la transacción del envío.
--
--   `contact_activity`: lo que hizo el equipo con el contacto — una nota, o
--     «le escribí por correo / por WhatsApp» (append-only).
--
-- RLS: las dos son tablas de dominio y nacen con `tenant_isolation`
-- (`db:generate` no genera políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- BACKFILL: los avisos `interesado_nuevo` de `staff_notice` (0065) congelaron
-- en `payload` lo que mandó cada persona. No son un historial completo (se
-- deduplican por persona + interés + día), pero es lo único que quedó: se
-- copian como envíos. Un aviso ya copiado —o un envío escrito por la app a
-- menos de 5 segundos del mismo aviso, para la misma persona y el mismo
-- origen— no se vuelve a copiar.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas e índices; FKs y
-- CHECKs dentro de `do $$` contra `pg_constraint`; el backfill usa un id
-- derivado del aviso (`cfs_<id del aviso>`) con `on conflict do nothing`.

create table if not exists "contact_form_submission" (
	"id" text primary key not null,
	"organization_id" text not null,
	"contact_id" text not null,
	"source" text not null,
	"ref" text not null,
	"interest_kind" text not null,
	"interest_name" text,
	"cohort_name" text,
	"first_name" text not null,
	"last_name" text,
	"phone" text,
	"email" text,
	"message" text,
	"company" text,
	"result" text,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

create table if not exists "contact_activity" (
	"id" text primary key not null,
	"organization_id" text not null,
	"contact_id" text not null,
	"author_user_id" text,
	"kind" text not null,
	"body" text,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'contact_form_submission_interest_kind_valid') then
    alter table "contact_form_submission" add constraint "contact_form_submission_interest_kind_valid"
      check ("interest_kind" in ('curso', 'taller', 'general'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_form_submission_organization_id_organization_id_fk') then
    alter table "contact_form_submission" add constraint "contact_form_submission_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_form_submission_contact_id_contact_id_fk') then
    alter table "contact_form_submission" add constraint "contact_form_submission_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'contact_activity_kind_valid') then
    alter table "contact_activity" add constraint "contact_activity_kind_valid"
      check ("kind" in ('nota', 'contacto_email', 'contacto_whatsapp'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_activity_note_has_body') then
    alter table "contact_activity" add constraint "contact_activity_note_has_body"
      check ("kind" <> 'nota' or ("body" is not null and length(trim("body")) > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_activity_organization_id_organization_id_fk') then
    alter table "contact_activity" add constraint "contact_activity_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_activity_contact_id_contact_id_fk') then
    alter table "contact_activity" add constraint "contact_activity_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_activity_author_user_id_user_id_fk') then
    alter table "contact_activity" add constraint "contact_activity_author_user_id_user_id_fk"
      foreign key ("author_user_id") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create index if not exists "contact_form_submission_org_contact_idx"
  on "contact_form_submission" using btree ("organization_id", "contact_id", "created_at" desc nulls last);--> statement-breakpoint
create index if not exists "contact_activity_org_contact_idx"
  on "contact_activity" using btree ("organization_id", "contact_id", "created_at" desc nulls last);--> statement-breakpoint

alter table "contact_form_submission" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "contact_form_submission";--> statement-breakpoint
create policy tenant_isolation on "contact_form_submission"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "contact_activity" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "contact_activity";--> statement-breakpoint
create policy tenant_isolation on "contact_activity"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

-- Backfill desde los avisos de nuevos interesados (0065).
insert into "contact_form_submission" (
  "id", "organization_id", "contact_id", "source", "ref", "interest_kind",
  "interest_name", "cohort_name", "first_name", "last_name", "phone", "email",
  "message", "company", "result", "created_at"
)
select
  'cfs_' || n."id",
  n."organization_id",
  n."contact_id",
  coalesce(nullif(n."payload"->>'origen', ''), 'formulario'),
  coalesce(
    nullif(regexp_replace(substr(n."dedup_key", length(n."contact_id") + 19), ':\d{4}-\d{2}-\d{2}$', ''), ''),
    'desconocido'
  ),
  case when n."payload"->'interes'->>'tipo' in ('curso', 'taller', 'general')
       then n."payload"->'interes'->>'tipo' else 'general' end,
  n."payload"->'interes'->>'nombre',
  n."payload"->'interes'->>'cohorte',
  coalesce(nullif(n."payload"->>'nombre', ''), '—'),
  n."payload"->>'apellido',
  n."payload"->>'telefono',
  n."payload"->>'email',
  n."payload"->>'mensaje',
  n."payload"->>'empresa',
  n."payload"->>'resultado',
  coalesce(((n."payload"->>'recibidoEn')::timestamptz at time zone 'UTC'), n."created_at")
from "staff_notice" n
where n."kind" = 'interesado_nuevo'
  and n."contact_id" is not null
  and n."payload" is not null
  and n."dedup_key" like 'interesado_nuevo:' || n."contact_id" || ':%'
  and not exists (
    select 1 from "contact_form_submission" s
    where s."organization_id" = n."organization_id"
      and s."contact_id" = n."contact_id"
      and s."source" = coalesce(nullif(n."payload"->>'origen', ''), 'formulario')
      and abs(extract(epoch from (
        s."created_at" - coalesce(((n."payload"->>'recibidoEn')::timestamptz at time zone 'UTC'), n."created_at")
      ))) < 5
  )
on conflict ("id") do nothing;
