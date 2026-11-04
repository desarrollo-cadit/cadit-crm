-- 2026-11-04 — Deshabilitar lecciones y temas de un curso offline (por ejemplo, un video que no anda).
--
--   1. `offline_lesson.disabled_at` y `offline_topic.disabled_at`: la fila NO se
--      borra. Mientras está deshabilitada no se muestra al alumno ni cuenta para
--      completar el curso.
--   2. `offline_course_completion`: quien YA terminó un curso lo conserva. Se
--      escribe al HABILITAR de nuevo un tema o una lección, para cada persona
--      que en ese momento cumplía el curso (hoy "completado" se deriva al leer).
--
-- Las columnas nuevas son nulas: ninguna lección ni tema existente cambia.

ALTER TABLE "offline_lesson" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "offline_topic" ADD COLUMN IF NOT EXISTS "disabled_at" timestamp;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "offline_course_completion" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"contact_id" text NOT NULL,
	"course_id" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "offline_course_completion" ADD CONSTRAINT "offline_course_completion_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offline_course_completion" ADD CONSTRAINT "offline_course_completion_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "offline_course_completion" ADD CONSTRAINT "offline_course_completion_course_id_offline_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."offline_course"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "offline_course_completion_contact_course_uq" ON "offline_course_completion" USING btree ("contact_id","course_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "offline_course_completion_org_course_idx" ON "offline_course_completion" USING btree ("organization_id","course_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "offline_course_completion" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "offline_course_completion";--> statement-breakpoint
create policy tenant_isolation on "offline_course_completion"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
