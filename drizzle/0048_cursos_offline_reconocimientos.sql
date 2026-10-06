-- 2026-10-06 — cursos-offline: reconocer lo que el alumno completó en la
-- academia anterior (un curso entero o algunas de sus lecciones).
--
--   `offline_recognition`
--     Un registro PROPIO, no progreso inventado: `offline_topic_progress` y
--     `offline_quiz_attempt` siguen diciendo "lo que el alumno hizo acá", y
--     revocar un reconocimiento no toca nada de eso. Lo completado se DERIVA
--     de las dos cosas (`courseProgressState`, offline-courses/logic.ts).
--     `lesson_id` NULL = el curso entero. Las filas revocadas quedan (quién y
--     cuándo); los índices únicos parciales permiten UNA fila activa por
--     (contacto, curso) y por (contacto, lección).
--
-- Tabla nueva con `organization_id`: RLS + `tenant_isolation` a mano
-- (db:generate no las escribe). Los permisos de `cadit_app` los cubre el
-- `alter default privileges` de la 0026.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índices; las FK
-- dentro de un `do $$` que consulta `pg_constraint`; la política se borra
-- antes de crearse. Se aplica una vez como `postgres` al arrancar el
-- contenedor. Sin relleno: ninguna fila existente cambia.

create table if not exists "offline_recognition" (
  "id" text primary key not null,
  "organization_id" text not null,
  "contact_id" text not null,
  "course_id" text not null,
  "lesson_id" text,
  "reason" text not null,
  "recognized_by" text,
  "recognized_at" timestamp DEFAULT now() NOT NULL,
  "revoked_at" timestamp,
  "revoked_by" text,
  constraint "offline_recognition_reason_present" check (length(trim("offline_recognition"."reason")) between 1 and 500)
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offline_recognition_organization_id_organization_id_fk') then
    alter table "offline_recognition" add constraint "offline_recognition_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_recognition_contact_id_contact_id_fk') then
    alter table "offline_recognition" add constraint "offline_recognition_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_recognition_course_id_offline_course_id_fk') then
    alter table "offline_recognition" add constraint "offline_recognition_course_id_offline_course_id_fk"
      foreign key ("course_id") references "public"."offline_course"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_recognition_lesson_id_offline_lesson_id_fk') then
    alter table "offline_recognition" add constraint "offline_recognition_lesson_id_offline_lesson_id_fk"
      foreign key ("lesson_id") references "public"."offline_lesson"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_recognition_recognized_by_user_id_fk') then
    alter table "offline_recognition" add constraint "offline_recognition_recognized_by_user_id_fk"
      foreign key ("recognized_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_recognition_revoked_by_user_id_fk') then
    alter table "offline_recognition" add constraint "offline_recognition_revoked_by_user_id_fk"
      foreign key ("revoked_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "offline_recognition_course_active_uq" on "offline_recognition" using btree ("contact_id","course_id") where lesson_id is null and revoked_at is null;--> statement-breakpoint
create unique index if not exists "offline_recognition_lesson_active_uq" on "offline_recognition" using btree ("contact_id","lesson_id") where lesson_id is not null and revoked_at is null;--> statement-breakpoint
create index if not exists "offline_recognition_org_contact_idx" on "offline_recognition" using btree ("organization_id","contact_id","course_id");--> statement-breakpoint
create index if not exists "offline_recognition_org_course_idx" on "offline_recognition" using btree ("organization_id","course_id");--> statement-breakpoint
create index if not exists "offline_recognition_org_lesson_idx" on "offline_recognition" using btree ("organization_id","lesson_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "offline_recognition" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_recognition";--> statement-breakpoint
create policy tenant_isolation on "offline_recognition"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
