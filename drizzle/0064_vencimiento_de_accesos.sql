-- 2026-10-19 — 043 Vencimiento de accesos y accesos directos a cursos offline.
--
--   El acceso a una cohorte vence solo (se calcula al LEER)
--     No hay columna "vencido" ni proceso que revoque: un mes calendario
--     después del fin de la cohorte (`src/lib/access-expiry.ts`). Lo único que
--     se guarda es la EXCEPCIÓN: `enrollment.access_until` (un día, medianoche
--     UTC) fijado a mano, con `access_until_set_at/_by`. NULL en todas las filas
--     existentes = la regla.
--
--     ATENCIÓN AL DESPLEGAR: quien terminó una cohorte hace más de un mes deja
--     de ver sus grabaciones, material, avisos y cursos offline de esa cohorte
--     en cuanto esto llega a producción. No hay período de gracia silencioso.
--     Antes de desplegar: `scripts/accesos-que-vencen.sql` lista a quién le
--     pasa.
--
--   `offline_course_grant` — acceso DIRECTO de una persona a un curso offline
--     Sin inscripción, con fecha límite obligatoria; se revoca marcando.
--     Un acceso activo por (contacto, curso): índice único parcial.
--
--   `offline_quiz_attempt.enrollment_id` pasa a NULL-able
--     Un intento hecho con un acceso directo no cuelga de una inscripción.
--
--   `contact.company_id` — la empresa de la PERSONA
--     Backfill: la empresa de su inscripción con empresa más reciente. Solo
--     llena las vacías: re-ejecutar no pisa lo que alguien editó después.
--
-- RLS: `offline_course_grant` es tabla de dominio nueva → `enable row level
-- security` + `tenant_isolation` (db:generate no las genera;
-- tests/unit/rls-cobertura.test.ts lo verifica). `contact`, `enrollment` y
-- `offline_quiz_attempt` ya tienen su política.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tablas, columnas e
-- índices; FKs y CHECKs dentro de `do $$` contra `pg_constraint`; el backfill
-- solo toca contactos sin empresa.

create table if not exists "offline_course_grant" (
	"id" text primary key not null,
	"organization_id" text not null,
	"contact_id" text not null,
	"offline_course_id" text not null,
	"access_until" timestamp not null,
	"note" text,
	"via_company_id" text,
	"created_at" timestamp default now() not null,
	"created_by" text,
	"updated_at" timestamp default now() not null,
	"updated_by" text,
	"revoked_at" timestamp,
	"revoked_by" text
);--> statement-breakpoint

alter table "offline_quiz_attempt" alter column "enrollment_id" drop not null;--> statement-breakpoint
alter table "contact" add column if not exists "company_id" text;--> statement-breakpoint
alter table "enrollment" add column if not exists "access_until" timestamp;--> statement-breakpoint
alter table "enrollment" add column if not exists "access_until_set_at" timestamp;--> statement-breakpoint
alter table "enrollment" add column if not exists "access_until_set_by" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_revocacion_coherente') then
    alter table "offline_course_grant" add constraint "offline_course_grant_revocacion_coherente"
      check ("revoked_by" is null or "revoked_at" is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_organization_id_organization_id_fk') then
    alter table "offline_course_grant" add constraint "offline_course_grant_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_contact_id_contact_id_fk') then
    alter table "offline_course_grant" add constraint "offline_course_grant_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_offline_course_id_offline_course_id_fk') then
    alter table "offline_course_grant" add constraint "offline_course_grant_offline_course_id_offline_course_id_fk"
      foreign key ("offline_course_id") references "public"."offline_course"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_via_company_id_company_id_fk') then
    alter table "offline_course_grant" add constraint "offline_course_grant_via_company_id_company_id_fk"
      foreign key ("via_company_id") references "public"."company"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_created_by_user_id_fk') then
    alter table "offline_course_grant" add constraint "offline_course_grant_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_updated_by_user_id_fk') then
    alter table "offline_course_grant" add constraint "offline_course_grant_updated_by_user_id_fk"
      foreign key ("updated_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_grant_revoked_by_user_id_fk') then
    alter table "offline_course_grant" add constraint "offline_course_grant_revoked_by_user_id_fk"
      foreign key ("revoked_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'contact_company_id_company_id_fk') then
    alter table "contact" add constraint "contact_company_id_company_id_fk"
      foreign key ("company_id") references "public"."company"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_access_until_set_by_user_id_fk') then
    alter table "enrollment" add constraint "enrollment_access_until_set_by_user_id_fk"
      foreign key ("access_until_set_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "offline_course_grant_activo_uq" on "offline_course_grant" using btree ("contact_id","offline_course_id") where revoked_at is null;--> statement-breakpoint
create index if not exists "offline_course_grant_org_contact_idx" on "offline_course_grant" using btree ("organization_id","contact_id");--> statement-breakpoint
create index if not exists "offline_course_grant_org_course_idx" on "offline_course_grant" using btree ("organization_id","offline_course_id");--> statement-breakpoint
create index if not exists "contact_org_company_idx" on "contact" using btree ("organization_id","company_id");--> statement-breakpoint

-- Backfill: la empresa de la inscripción con empresa más reciente de cada
-- persona, solo donde el contacto todavía no tiene una.
update "contact" c
set "company_id" = ult."company_id"
from (
  select distinct on (e."contact_id") e."contact_id", e."company_id"
  from "enrollment" e
  where e."company_id" is not null
  order by e."contact_id", e."created_at" desc, e."id" desc
) ult
where c."id" = ult."contact_id"
  and c."company_id" is null;--> statement-breakpoint

alter table "offline_course_grant" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_course_grant";--> statement-breakpoint
create policy tenant_isolation on "offline_course_grant"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
