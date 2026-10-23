-- 2026-10-23 — 046 Recorrido comercial: rutas entre cursos.
--
--   `course_route`  curso de origen → curso siguiente recomendado, en orden
--                   (`position` 0, 1, 2…). Curada a mano por Coordinación
--                   desde Académico; la usan "Le podría interesar" y el
--                   atajo de audiencias "siguiente paso de la ruta".
--
--   Reglas que garantiza la base:
--     `course_route_no_self`         un curso no se sigue a sí mismo (FR-005)
--     `course_route_org_from_to_uq`  sin repetidos dentro de un origen
--   Los ciclos (A → B → A) se permiten a propósito (spec, Edge Cases).
--
-- RLS: nace con `tenant_isolation` (`db:generate` no genera políticas;
-- `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índices; FKs y
-- CHECK dentro de `do $$` contra `pg_constraint`; política con
-- `drop policy if exists`.

create table if not exists "course_route" (
	"id" text primary key not null,
	"organization_id" text not null,
	"from_course_id" text not null,
	"to_course_id" text not null,
	"position" integer not null,
	"created_by" text,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'course_route_no_self') then
    alter table "course_route" add constraint "course_route_no_self"
      check ("from_course_id" <> "to_course_id");
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_route_organization_id_organization_id_fk') then
    alter table "course_route" add constraint "course_route_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_route_from_course_id_course_id_fk') then
    alter table "course_route" add constraint "course_route_from_course_id_course_id_fk"
      foreign key ("from_course_id") references "public"."course"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_route_to_course_id_course_id_fk') then
    alter table "course_route" add constraint "course_route_to_course_id_course_id_fk"
      foreign key ("to_course_id") references "public"."course"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'course_route_created_by_user_id_fk') then
    alter table "course_route" add constraint "course_route_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "course_route_org_from_to_uq"
  on "course_route" using btree ("organization_id", "from_course_id", "to_course_id");--> statement-breakpoint
create index if not exists "course_route_org_from_pos_idx"
  on "course_route" using btree ("organization_id", "from_course_id", "position");--> statement-breakpoint

alter table "course_route" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "course_route";--> statement-breakpoint
create policy tenant_isolation on "course_route"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
