-- 2026-10-06 — Vendedores: quien vende, use o no el panel.
--
--   `seller`
--     Hasta acá `enrollment.seller_id` apuntaba a `user.id`: sólo podía
--     figurar como vendedor quien tenía cuenta en el panel. La academia tiene
--     vendedores que nunca entran. `user_id` queda como vínculo OPCIONAL.
--     No se borra: se archiva (`archived_at`).
--
--   `enrollment.seller_id`
--     Pasa a apuntar a `seller.id`. **Ninguna asignación se pierde**: se crea
--     un vendedor por cada usuario que YA figura como vendedor de alguna
--     inscripción (nombre tomado de `user.name`, `user_id` vinculado), se
--     reescribe cada `seller_id` al vendedor nuevo y recién entonces se pone
--     la FK nueva. El orden importa: con la FK vieja puesta el UPDATE choca, y
--     con la nueva puesta antes, también.
--
--   Decisión: se siembran SÓLO los usuarios ya usados como vendedores, no todo
--   el equipo. Sembrar cada cuenta del panel llenaría la lista de gente que
--   nunca vendió (soporte, coordinación) y el selector de la venta ofrecería
--   nombres que no corresponden. El resto se carga en Ajustes → Vendedores.
--
-- Tabla nueva con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no las escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índices; las FK
-- dentro de un `do $$` que consulta `pg_constraint`; los ids sembrados son
-- deterministas (md5 de organización + usuario) con `on conflict do nothing`;
-- y una segunda corrida no reescribe nada, porque después de la primera
-- `seller_id` ya contiene ids `sel_…`, que no coinciden con ningún usuario.
-- Se aplica una vez como `postgres` al arrancar el contenedor.

create table if not exists "seller" (
  "id" text primary key not null,
  "organization_id" text not null,
  "name" text not null,
  "email" text,
  "user_id" text,
  "archived_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  constraint "seller_name_present" check (length(trim("seller"."name")) between 1 and 120)
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'seller_organization_id_organization_id_fk') then
    alter table "seller" add constraint "seller_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'seller_user_id_user_id_fk') then
    alter table "seller" add constraint "seller_user_id_user_id_fk"
      foreign key ("user_id") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create index if not exists "seller_org_idx" on "seller" using btree ("organization_id");--> statement-breakpoint
create unique index if not exists "seller_org_user_uq" on "seller" using btree ("organization_id","user_id") where "seller"."user_id" is not null;--> statement-breakpoint

-- 1. Un vendedor por cada usuario que ya vendió, en cada organización.
insert into "seller" ("id", "organization_id", "name", "email", "user_id")
select
  'sel_' || substr(md5(v.organization_id || ':' || u.id), 1, 20),
  v.organization_id,
  left(coalesce(nullif(trim(u.name), ''), nullif(trim(u.email), ''), 'Vendedor'), 120),
  u.email,
  u.id
from (
  select distinct e.organization_id, e.seller_id
  from "enrollment" e
  where e.seller_id is not null
) v
join "user" u on u.id = v.seller_id
on conflict do nothing;--> statement-breakpoint

-- 2. Soltar la FK vieja (enrollment.seller_id → user.id).
alter table "enrollment" drop constraint if exists "enrollment_seller_id_user_id_fk";--> statement-breakpoint

-- 3. Reescribir cada asignación al vendedor de su MISMA organización.
update "enrollment" e
set seller_id = s.id
from "seller" s
where s.user_id = e.seller_id
  and s.organization_id = e.organization_id;--> statement-breakpoint

-- 4. La FK nueva (enrollment.seller_id → seller.id).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enrollment_seller_id_seller_id_fk') then
    alter table "enrollment" add constraint "enrollment_seller_id_seller_id_fk"
      foreign key ("seller_id") references "public"."seller"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "seller" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "seller";--> statement-breakpoint
create policy tenant_isolation on "seller"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
