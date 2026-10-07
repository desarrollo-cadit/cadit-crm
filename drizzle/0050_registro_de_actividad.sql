-- 2026-10-07 — Registro de actividad + la capacidad `alumnos.auditoria`.
--
--   `activity_log`
--     Lo que una persona hizo, anotado en el momento. Hoy: cada ingreso al
--     portal de un alumno o un profesor (`portal.sign_in`), con IP y user
--     agent. La lee la pestaña «Administración» del legajo. Empieza VACÍA: no
--     hay ingresos históricos que reconstruir (Better Auth borra las sesiones
--     vencidas), y la pantalla lo dice.
--
--   `role.capabilities` de `direccion`
--     La capacidad nueva entra en `SYSTEM_ROLES` (código), pero eso solo
--     siembra organizaciones NUEVAS (`on-signup.ts`). La organización real ya
--     tiene su fila `direccion`, y sin esto la dueña no vería la pestaña.
--     Precedente: la 0036 sembró un rol que no existía; esta suma una
--     capacidad que no existía. No pisa configuración humana: nadie pudo
--     haberle quitado a mano una capacidad que hasta hoy no existía. Solo
--     `direccion` — coordinación, soporte y administración no la reciben
--     (`capabilities.ts`, `sinAuditoria`).
--
-- Tabla nueva con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no las escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índice; las FK
-- dentro de un `do $$` que consulta `pg_constraint`; la política con
-- `drop policy if exists`; y la capacidad se agrega solo donde todavía no
-- está (`@>`), así que una segunda corrida no la duplica.
-- Se aplica una vez como `postgres` al arrancar el contenedor.

create table if not exists "activity_log" (
  "id" text primary key not null,
  "organization_id" text not null,
  "contact_id" text,
  "user_id" text,
  "kind" text not null,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'activity_log_organization_id_organization_id_fk') then
    alter table "activity_log" add constraint "activity_log_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activity_log_contact_id_contact_id_fk') then
    alter table "activity_log" add constraint "activity_log_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'activity_log_user_id_user_id_fk') then
    alter table "activity_log" add constraint "activity_log_user_id_user_id_fk"
      foreign key ("user_id") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create index if not exists "activity_log_org_contact_created_idx" on "activity_log" using btree ("organization_id","contact_id","created_at" DESC NULLS LAST);--> statement-breakpoint

-- La capacidad nueva, a la dirección de cada organización que ya existe.
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('alumnos.auditoria'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('alumnos.auditoria'));--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "activity_log" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "activity_log";--> statement-breakpoint
create policy tenant_isolation on "activity_log"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
