-- cursos-offline — La biblioteca de cursos offline (el contenido de LearnDash).
--
-- Ocho tablas nuevas. Qué agregan y por qué:
--
--   `offline_course` → `offline_lesson` → `offline_topic`
--     El contenido de lectura: curso, lección y tema, en markdown. Es de SOLO
--     LECTURA dentro del CRM (no hay pantalla de edición): entra por el script
--     de importación. No toca `course`, `cohort` ni `enrollment`.
--
--   `offline_quiz` → `offline_question` → `offline_answer`
--     Los cuestionarios de opción única o múltiple. El quiz cuelga del CURSO;
--     de una lección solo cuando la lección nombra el mismo módulo, y por eso
--     `lesson_id` es nullable con `set null`: perder la lección no se lleva el
--     quiz ni su historial. `is_correct` JAMÁS viaja al alumno.
--
--   `offline_quiz_attempt`
--     Un intento = una fila, y ninguna se actualiza. Los reintentos se cuentan
--     por CONTACTO (a través de todas sus inscripciones), así que el índice
--     único es (quiz, contacto, número de intento): dos envíos simultáneos no
--     pueden quedarse con el mismo número (constitución IV). `answers_given`
--     guarda una FOTO (ids + textos) para que el historial sobreviva a una
--     reimportación.
--
--   `offline_course_access`
--     Quién lee qué curso. Dos clases de fila, y el CHECK exige exactamente una:
--       - de COHORTE (`cohort_id`, `mode` NULL): toda la cohorte lo hereda;
--       - de INSCRIPCIÓN (`enrollment_id`, `mode` grant|revoke): la excepción
--         individual sobre lo que hereda.
--     Acceso efectivo = (cohorte asignada Y sin revoke) O grant.
--
-- `legacy_ref` es ÚNICO por organización en cada tabla de contenido: volver a
-- correr la importación ACTUALIZA, no duplica (constitución IV).
--
-- ============================================================
-- RLS: ESCRITA A MANO (db:generate no la produce)
-- ============================================================
-- Las ocho tablas llevan `organization_id`, así que las ocho necesitan
-- `enable row level security` + `tenant_isolation`, con la MISMA política de
-- la 0025: sin `app.current_org` no se ve ninguna fila (falla cerrado) y el
-- `with check` explícito impide escribir filas de otra organización.
-- `tests/unit/rls-cobertura.test.ts` falla si alguna falta. Los permisos de
-- `cadit_app` los cubre el `alter default privileges` de la 0026.
--
-- ============================================================
-- RE-EJECUTABLE (constitución IV)
-- ============================================================
-- `create table if not exists`, `create index if not exists`, las FK dentro
-- de un `do $$` que consulta `pg_constraint`, y la política borrada antes de
-- crearse. Las tablas se crean de padre a hijo.
--
-- ============================================================
-- SIN REGRESIÓN
-- ============================================================
-- Solo tablas nuevas: ninguna columna existente cambia y no hay backfill.

create table if not exists "offline_course" (
  "id" text primary key not null,
  "organization_id" text not null,
  "legacy_ref" text not null,
  "title" text not null,
  "slug" text not null,
  "description_md" text DEFAULT '' NOT NULL,
  "thumbnail_url" text,
  "status" text DEFAULT 'published' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

create table if not exists "offline_lesson" (
  "id" text primary key not null,
  "organization_id" text not null,
  "course_id" text not null,
  "legacy_ref" text not null,
  "title" text not null,
  "content_md" text DEFAULT '' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

create table if not exists "offline_topic" (
  "id" text primary key not null,
  "organization_id" text not null,
  "lesson_id" text not null,
  "legacy_ref" text not null,
  "title" text not null,
  "content_md" text DEFAULT '' NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

create table if not exists "offline_quiz" (
  "id" text primary key not null,
  "organization_id" text not null,
  "course_id" text not null,
  "lesson_id" text,
  "legacy_ref" text not null,
  "title" text not null,
  "description_md" text DEFAULT '' NOT NULL,
  "passing_percentage" integer DEFAULT 80 NOT NULL,
  "retries_allowed" integer,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "offline_quiz_passing_range" CHECK ("offline_quiz"."passing_percentage" between 0 and 100),
  CONSTRAINT "offline_quiz_retries_non_negative" CHECK ("offline_quiz"."retries_allowed" is null or "offline_quiz"."retries_allowed" >= 0)
);--> statement-breakpoint

create table if not exists "offline_question" (
  "id" text primary key not null,
  "organization_id" text not null,
  "quiz_id" text not null,
  "legacy_ref" text not null,
  "question_md" text not null,
  "answer_type" text not null,
  "points" integer DEFAULT 1 NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "offline_question_points_non_negative" CHECK ("offline_question"."points" >= 0)
);--> statement-breakpoint

create table if not exists "offline_answer" (
  "id" text primary key not null,
  "organization_id" text not null,
  "question_id" text not null,
  "legacy_ref" text not null,
  "text" text not null,
  "is_correct" boolean DEFAULT false NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

create table if not exists "offline_quiz_attempt" (
  "id" text primary key not null,
  "organization_id" text not null,
  "quiz_id" text not null,
  "enrollment_id" text not null,
  "contact_id" text not null,
  "attempt_number" integer not null,
  "score_percentage" numeric(5, 2) not null,
  "passed" boolean not null,
  "answers_given" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "offline_quiz_attempt_number_positive" CHECK ("offline_quiz_attempt"."attempt_number" >= 1)
);--> statement-breakpoint

create table if not exists "offline_course_access" (
  "id" text primary key not null,
  "organization_id" text not null,
  "offline_course_id" text not null,
  "cohort_id" text,
  "enrollment_id" text,
  "mode" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "created_by" text,
  CONSTRAINT "offline_course_access_target_coherent" CHECK (("offline_course_access"."cohort_id" is not null and "offline_course_access"."enrollment_id" is null and "offline_course_access"."mode" is null)
       or ("offline_course_access"."enrollment_id" is not null and "offline_course_access"."cohort_id" is null and "offline_course_access"."mode" is not null))
);--> statement-breakpoint

-- Las claves foráneas. `cascade` hacia la organización y hacia el padre del
-- contenido: borrado el curso, sus lecciones no significan nada. `set null`
-- en `offline_quiz.lesson_id` (el quiz es del curso) y en `created_by` (que
-- alguien deje la academia no borra la asignación que hizo).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offline_course_organization_id_organization_id_fk') then
    alter table "offline_course" add constraint "offline_course_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_lesson_organization_id_organization_id_fk') then
    alter table "offline_lesson" add constraint "offline_lesson_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_lesson_course_id_offline_course_id_fk') then
    alter table "offline_lesson" add constraint "offline_lesson_course_id_offline_course_id_fk"
      foreign key ("course_id") references "public"."offline_course"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_topic_organization_id_organization_id_fk') then
    alter table "offline_topic" add constraint "offline_topic_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_topic_lesson_id_offline_lesson_id_fk') then
    alter table "offline_topic" add constraint "offline_topic_lesson_id_offline_lesson_id_fk"
      foreign key ("lesson_id") references "public"."offline_lesson"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_quiz_organization_id_organization_id_fk') then
    alter table "offline_quiz" add constraint "offline_quiz_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_quiz_course_id_offline_course_id_fk') then
    alter table "offline_quiz" add constraint "offline_quiz_course_id_offline_course_id_fk"
      foreign key ("course_id") references "public"."offline_course"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_quiz_lesson_id_offline_lesson_id_fk') then
    alter table "offline_quiz" add constraint "offline_quiz_lesson_id_offline_lesson_id_fk"
      foreign key ("lesson_id") references "public"."offline_lesson"("id")
      on delete set null on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_question_organization_id_organization_id_fk') then
    alter table "offline_question" add constraint "offline_question_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_question_quiz_id_offline_quiz_id_fk') then
    alter table "offline_question" add constraint "offline_question_quiz_id_offline_quiz_id_fk"
      foreign key ("quiz_id") references "public"."offline_quiz"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_answer_organization_id_organization_id_fk') then
    alter table "offline_answer" add constraint "offline_answer_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_answer_question_id_offline_question_id_fk') then
    alter table "offline_answer" add constraint "offline_answer_question_id_offline_question_id_fk"
      foreign key ("question_id") references "public"."offline_question"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_quiz_attempt_organization_id_organization_id_fk') then
    alter table "offline_quiz_attempt" add constraint "offline_quiz_attempt_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_quiz_attempt_quiz_id_offline_quiz_id_fk') then
    alter table "offline_quiz_attempt" add constraint "offline_quiz_attempt_quiz_id_offline_quiz_id_fk"
      foreign key ("quiz_id") references "public"."offline_quiz"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_quiz_attempt_enrollment_id_enrollment_id_fk') then
    alter table "offline_quiz_attempt" add constraint "offline_quiz_attempt_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_quiz_attempt_contact_id_contact_id_fk') then
    alter table "offline_quiz_attempt" add constraint "offline_quiz_attempt_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_course_access_organization_id_organization_id_fk') then
    alter table "offline_course_access" add constraint "offline_course_access_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_access_offline_course_id_offline_course_id_fk') then
    alter table "offline_course_access" add constraint "offline_course_access_offline_course_id_offline_course_id_fk"
      foreign key ("offline_course_id") references "public"."offline_course"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_access_cohort_id_cohort_id_fk') then
    alter table "offline_course_access" add constraint "offline_course_access_cohort_id_cohort_id_fk"
      foreign key ("cohort_id") references "public"."cohort"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_access_enrollment_id_enrollment_id_fk') then
    alter table "offline_course_access" add constraint "offline_course_access_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'offline_course_access_created_by_user_id_fk') then
    alter table "offline_course_access" add constraint "offline_course_access_created_by_user_id_fk"
      foreign key ("created_by") references "public"."user"("id")
      on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

-- Índices: org primero, como el resto de las tablas de dominio. Los únicos
-- sobre `legacy_ref` son los que hacen idempotente la reimportación.
create unique index if not exists "offline_course_org_legacy_uq" on "offline_course" using btree ("organization_id","legacy_ref");--> statement-breakpoint
create index if not exists "offline_course_org_title_idx" on "offline_course" using btree ("organization_id","title");--> statement-breakpoint
create unique index if not exists "offline_lesson_org_legacy_uq" on "offline_lesson" using btree ("organization_id","legacy_ref");--> statement-breakpoint
create index if not exists "offline_lesson_org_course_idx" on "offline_lesson" using btree ("organization_id","course_id","position");--> statement-breakpoint
create unique index if not exists "offline_topic_org_legacy_uq" on "offline_topic" using btree ("organization_id","legacy_ref");--> statement-breakpoint
create index if not exists "offline_topic_org_lesson_idx" on "offline_topic" using btree ("organization_id","lesson_id","position");--> statement-breakpoint
create unique index if not exists "offline_quiz_org_legacy_uq" on "offline_quiz" using btree ("organization_id","legacy_ref");--> statement-breakpoint
create index if not exists "offline_quiz_org_course_idx" on "offline_quiz" using btree ("organization_id","course_id","position");--> statement-breakpoint
create unique index if not exists "offline_question_org_legacy_uq" on "offline_question" using btree ("organization_id","legacy_ref");--> statement-breakpoint
create index if not exists "offline_question_org_quiz_idx" on "offline_question" using btree ("organization_id","quiz_id","position");--> statement-breakpoint
create unique index if not exists "offline_answer_org_legacy_uq" on "offline_answer" using btree ("organization_id","legacy_ref");--> statement-breakpoint
create index if not exists "offline_answer_org_question_idx" on "offline_answer" using btree ("organization_id","question_id","position");--> statement-breakpoint
create unique index if not exists "offline_quiz_attempt_quiz_contact_number_uq" on "offline_quiz_attempt" using btree ("quiz_id","contact_id","attempt_number");--> statement-breakpoint
create index if not exists "offline_quiz_attempt_org_contact_idx" on "offline_quiz_attempt" using btree ("organization_id","contact_id","quiz_id");--> statement-breakpoint
create index if not exists "offline_quiz_attempt_org_enrollment_idx" on "offline_quiz_attempt" using btree ("organization_id","enrollment_id");--> statement-breakpoint
-- Parciales: una asignación por cohorte y curso, y una excepción por
-- inscripción y curso (cambiar grant↔revoke CORRIGE la fila, no suma otra).
create unique index if not exists "offline_course_access_cohort_uq" on "offline_course_access" using btree ("cohort_id","offline_course_id") where cohort_id is not null;--> statement-breakpoint
create unique index if not exists "offline_course_access_enrollment_uq" on "offline_course_access" using btree ("enrollment_id","offline_course_id") where enrollment_id is not null;--> statement-breakpoint
create index if not exists "offline_course_access_org_cohort_idx" on "offline_course_access" using btree ("organization_id","cohort_id");--> statement-breakpoint
create index if not exists "offline_course_access_org_enrollment_idx" on "offline_course_access" using btree ("organization_id","enrollment_id");--> statement-breakpoint
create index if not exists "offline_course_access_org_course_idx" on "offline_course_access" using btree ("organization_id","offline_course_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "offline_course" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_course";--> statement-breakpoint
create policy tenant_isolation on "offline_course"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "offline_lesson" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_lesson";--> statement-breakpoint
create policy tenant_isolation on "offline_lesson"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "offline_topic" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_topic";--> statement-breakpoint
create policy tenant_isolation on "offline_topic"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "offline_quiz" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_quiz";--> statement-breakpoint
create policy tenant_isolation on "offline_quiz"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "offline_question" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_question";--> statement-breakpoint
create policy tenant_isolation on "offline_question"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "offline_answer" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_answer";--> statement-breakpoint
create policy tenant_isolation on "offline_answer"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "offline_quiz_attempt" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_quiz_attempt";--> statement-breakpoint
create policy tenant_isolation on "offline_quiz_attempt"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "offline_course_access" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_course_access";--> statement-breakpoint
create policy tenant_isolation on "offline_course_access"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
