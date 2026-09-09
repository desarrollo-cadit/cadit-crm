-- Constitución III — `organization_id` explícito en las dos tablas puente.
-- Hasta acá la seguridad dependía de que CADA llamador filtrara el padre por
-- organización antes de tocar el puente. Con la columna, `scoped()` vuelve
-- inexpresable la query sin tenant.
--
-- El ADD COLUMN que genera drizzle-kit es `NOT NULL` directo, que falla en
-- cualquier instalación con filas cargadas. Se hace en tres pasos: columna
-- nullable, backfill desde el padre (`cohort` / `teacher`, que ya llevan su
-- organización) y recién ahí la restricción. No hay filas huérfanas posibles:
-- `cohort_id` y `teacher_id` son NOT NULL con FK, así que el backfill las
-- cubre todas.

ALTER TABLE "cohort_software" ADD COLUMN IF NOT EXISTS "organization_id" text;--> statement-breakpoint
UPDATE "cohort_software" cs
  SET "organization_id" = c."organization_id"
  FROM "cohort" c
  WHERE c."id" = cs."cohort_id" AND cs."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "cohort_software" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "teacher_course" ADD COLUMN IF NOT EXISTS "organization_id" text;--> statement-breakpoint
UPDATE "teacher_course" tc
  SET "organization_id" = t."organization_id"
  FROM "teacher" t
  WHERE t."id" = tc."teacher_id" AND tc."organization_id" IS NULL;--> statement-breakpoint
ALTER TABLE "teacher_course" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "cohort_software" ADD CONSTRAINT "cohort_software_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_course" ADD CONSTRAINT "teacher_course_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cohort_software_org_idx" ON "cohort_software" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "teacher_course_org_idx" ON "teacher_course" USING btree ("organization_id");
