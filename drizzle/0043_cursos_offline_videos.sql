-- cursos-offline v2 — Videos de Vimeo y progreso por tema.
--
-- Qué agrega y por qué:
--
--   `offline_topic.video_url` / `offline_topic.video_shown`
--     El export v2 de LearnDash trae un video de Vimeo por tema y dónde va
--     respecto del texto (antes|después). `video_url` es NULL cuando el tema no
--     tiene video: ese tema se completa al abrirlo. Solo el NAVEGADOR carga el
--     reproductor oficial (constitución 1.4.0, Principio II, ítem 4): el
--     servidor guarda la URL y nada más — sin tokens, sin video almacenado.
--
--   `offline_topic_progress`
--     Cuánto avanzó un CONTACTO en un tema (por contacto, igual que los
--     intentos: el progreso sigue a la persona entre inscripciones). Una fila
--     por (contacto, tema). `watched_ratio` es la parte del video realmente
--     reproducida (rangos fusionados, 0..1). `completion_source` dice cómo se
--     completó: `video`, `no_video` o `staff`; `completed_by` existe SOLO para
--     la marca manual del staff (quién y cuándo, para poder revisarla).
--
-- ============================================================
-- RLS: ESCRITA A MANO (db:generate no la produce)
-- ============================================================
-- La tabla nueva lleva `organization_id`, así que necesita
-- `enable row level security` + `tenant_isolation` con la MISMA política de la
-- 0025/0042: sin `app.current_org` no se ve ninguna fila (falla cerrado) y el
-- `with check` impide escribir filas de otra organización. Los permisos de
-- `cadit_app` los cubre el `alter default privileges` de la 0026.
--
-- ============================================================
-- RE-EJECUTABLE (constitución IV)
-- ============================================================
-- `add column if not exists`, `create table if not exists`,
-- `create index if not exists`, y las FK y CHECK dentro de un `do $$` que
-- consulta `pg_constraint`; la política se borra antes de crearse.
--
-- ============================================================
-- SIN REGRESIÓN
-- ============================================================
-- Las columnas nuevas son nullable o traen default: las filas existentes de
-- `offline_topic` quedan sin video y con `video_shown = 'after'`.

alter table "offline_topic" add column if not exists "video_url" text;--> statement-breakpoint
alter table "offline_topic" add column if not exists "video_shown" text default 'after' not null;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offline_topic_video_shown_valid') then
    alter table "offline_topic" add constraint "offline_topic_video_shown_valid"
      check ("offline_topic"."video_shown" in ('before', 'after'));
  end if;
end $$;--> statement-breakpoint

create table if not exists "offline_topic_progress" (
  "id" text primary key not null,
  "organization_id" text not null,
  "contact_id" text not null,
  "topic_id" text not null,
  "watched_ratio" numeric(5, 4) default '0' not null,
  "completed_at" timestamp,
  "completed_by" text,
  "completion_source" text,
  "created_at" timestamp default now() not null,
  "updated_at" timestamp default now() not null
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_ratio_range') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_ratio_range"
      check ("offline_topic_progress"."watched_ratio" >= 0 and "offline_topic_progress"."watched_ratio" <= 1);
  end if;

  -- Completado y "cómo" van juntos: ninguno de los dos sin el otro.
  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_completion_coherent') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_completion_coherent"
      check (("offline_topic_progress"."completed_at" is null) = ("offline_topic_progress"."completion_source" is null));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_source_valid') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_source_valid"
      check ("offline_topic_progress"."completion_source" is null or "offline_topic_progress"."completion_source" in ('video', 'no_video', 'staff'));
  end if;

  -- El autor de una marca existe solo para la marca manual del staff.
  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_staff_author') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_staff_author"
      check ("offline_topic_progress"."completed_by" is null or "offline_topic_progress"."completion_source" = 'staff');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_organization_id_organization_id_fk') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_contact_id_contact_id_fk') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_topic_id_offline_topic_id_fk') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_topic_id_offline_topic_id_fk"
      foreign key ("topic_id") references "public"."offline_topic"("id")
      on delete cascade on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'offline_topic_progress_completed_by_user_id_fk') then
    alter table "offline_topic_progress" add constraint "offline_topic_progress_completed_by_user_id_fk"
      foreign key ("completed_by") references "public"."user"("id")
      on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "offline_topic_progress_contact_topic_uq" on "offline_topic_progress" using btree ("contact_id","topic_id");--> statement-breakpoint
create index if not exists "offline_topic_progress_org_contact_idx" on "offline_topic_progress" using btree ("organization_id","contact_id");--> statement-breakpoint
create index if not exists "offline_topic_progress_org_topic_idx" on "offline_topic_progress" using btree ("organization_id","topic_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "offline_topic_progress" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_topic_progress";--> statement-breakpoint
create policy tenant_isolation on "offline_topic_progress"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
