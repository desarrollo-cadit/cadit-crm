-- 006 Contenido comercial del curso — PASO 2 de 2 (restricciones).
-- Depende del backfill de 0014: `slug` ya viene poblado y sin colisiones por
-- organización, y `cohort.syllabus_url` ya fue trasladado a `course`.
ALTER TABLE "course" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "course_org_slug_uq" ON "course" USING btree ("organization_id","slug");--> statement-breakpoint
ALTER TABLE "cohort" DROP COLUMN "syllabus_url";