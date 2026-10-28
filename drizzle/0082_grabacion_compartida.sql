-- 2026-10-28 — Grabación compartida entre grupos.
--
-- Dos grupos (p. ej. "AutoCAD Estudiantes" y "AutoCAD Profesionales")
-- comparten las primeras clases: entran a la MISMA reunión de Zoom a la MISMA
-- hora. Una grabación tiene que poder ir a una clase de CADA grupo; cada clase
-- sigue teniendo a lo sumo UNA grabación.
--
--   1. `zoom_recording_class` (organization_id, recording_id, class_session_id):
--      la verdad de la adjudicación. UNIQUE (organization_id, class_session_id)
--      = una clase, una grabación. Borrar una clase con grabación se rechaza
--      (`restrict`), igual que antes lo hacía el CHECK
--      `zoom_recording_assigned_has_class`.
--   2. `zoom_recording.missing_from_class_session_ids` (text[]): las clases de
--      las que se la soltó al faltar en Zoom (antes una sola).
--   3. Backfill desde las columnas viejas y, recién después, se borran
--      `class_session_id` (con su índice único, su FK y el CHECK "asignada ⇔
--      clase", que ya no cabe en un CHECK) y `missing_from_class_session_id`.
--
-- Los portales no cambian: siguen leyendo `class_session.recording_url`.
--
-- RLS: la tabla nueva nace con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla, columna e
-- índices; FKs dentro de `do $$` contra `pg_constraint`; el backfill corre
-- solo mientras existan las columnas viejas y no duplica (`on conflict do
-- nothing`); `drop ... if exists` para lo que se va.

create table if not exists "zoom_recording_class" (
	"organization_id" text not null,
	"recording_id" text not null,
	"class_session_id" text not null,
	"created_at" timestamp default now() not null,
	constraint "zoom_recording_class_recording_id_class_session_id_pk" primary key("recording_id","class_session_id")
);--> statement-breakpoint

alter table "zoom_recording" add column if not exists "missing_from_class_session_ids" text[] default '{}'::text[] not null;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_class_organization_id_organization_id_fk') then
    alter table "zoom_recording_class" add constraint "zoom_recording_class_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_class_recording_id_zoom_recording_id_fk') then
    alter table "zoom_recording_class" add constraint "zoom_recording_class_recording_id_zoom_recording_id_fk"
      foreign key ("recording_id") references "public"."zoom_recording"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'zoom_recording_class_class_session_id_class_session_id_fk') then
    alter table "zoom_recording_class" add constraint "zoom_recording_class_class_session_id_class_session_id_fk"
      foreign key ("class_session_id") references "public"."class_session"("id") on delete restrict on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "zoom_recording_class_org_class_uq" on "zoom_recording_class" using btree ("organization_id","class_session_id");--> statement-breakpoint
create index if not exists "zoom_recording_class_org_rec_idx" on "zoom_recording_class" using btree ("organization_id","recording_id");--> statement-breakpoint

-- Backfill: solo si todavía están las columnas viejas (la segunda corrida no
-- las encuentra y no hace nada).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_name = 'zoom_recording' and column_name = 'class_session_id'
  ) then
    execute $q$
      insert into "zoom_recording_class" ("organization_id", "recording_id", "class_session_id")
      select "organization_id", "id", "class_session_id" from "zoom_recording"
      where "class_session_id" is not null
      on conflict do nothing
    $q$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_name = 'zoom_recording' and column_name = 'missing_from_class_session_id'
  ) then
    execute $q$
      update "zoom_recording" set "missing_from_class_session_ids" = array["missing_from_class_session_id"]
      where "missing_from_class_session_id" is not null
        and "missing_from_class_session_ids" = '{}'::text[]
    $q$;
  end if;
end $$;--> statement-breakpoint

alter table "zoom_recording" drop constraint if exists "zoom_recording_assigned_has_class";--> statement-breakpoint
alter table "zoom_recording" drop constraint if exists "zoom_recording_class_session_id_class_session_id_fk";--> statement-breakpoint
alter table "zoom_recording" drop constraint if exists "zoom_recording_missing_from_class_fk";--> statement-breakpoint
drop index if exists "zoom_recording_org_class_uq";--> statement-breakpoint
alter table "zoom_recording" drop column if exists "missing_from_class_session_id";--> statement-breakpoint
alter table "zoom_recording" drop column if exists "class_session_id";--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "zoom_recording_class" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "zoom_recording_class";--> statement-breakpoint
create policy tenant_isolation on "zoom_recording_class"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
