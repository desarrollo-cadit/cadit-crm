-- 006 Contenido comercial del curso — PASO 1 de 2 (aditivo).
-- Editada a mano sobre la generada: agrega el backfill de `course.slug` y el
-- traslado de `cohort.syllabus_url` a `course.syllabus_url`. El paso 2 (0015)
-- recién ahí pone `slug` NOT NULL + único y borra la columna de `cohort`.
-- Re-ejecutable: los UPDATE están guardados por `IS NULL`.

CREATE TABLE "course_category" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "course_module" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"course_id" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "slug" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "category_id" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "modality" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "duration_weeks" integer;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "hours_per_week" integer;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "learning_objectives" jsonb;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "target_audience" text;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "syllabus_url" text;--> statement-breakpoint
ALTER TABLE "course_category" ADD CONSTRAINT "course_category_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_module" ADD CONSTRAINT "course_module_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_module" ADD CONSTRAINT "course_module_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "course_category_org_slug_uq" ON "course_category" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "course_module_course_idx" ON "course_module" USING btree ("course_id","position");--> statement-breakpoint
ALTER TABLE "course" ADD CONSTRAINT "course_category_id_course_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."course_category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "course_category_idx" ON "course" USING btree ("category_id");--> statement-breakpoint

-- Backfill de `slug` para cursos ya existentes: se deriva del nombre
-- (minúsculas, acentos planchados con translate() para no depender de la
-- extensión unaccent, todo lo no alfanumérico a guiones). Ante dos cursos de
-- la misma organización que colapsan al mismo slug, el más viejo se queda con
-- el limpio y los siguientes reciben sufijo -2, -3… para poder cumplir el
-- índice único que agrega 0015.
UPDATE "course" c
SET "slug" = CASE WHEN s.rn = 1 THEN s.base ELSE s.base || '-' || s.rn END
FROM (
  SELECT id,
         base,
         row_number() OVER (PARTITION BY organization_id, base ORDER BY created_at, id) AS rn
  FROM (
    SELECT id,
           organization_id,
           created_at,
           coalesce(
             nullif(
               trim(both '-' from regexp_replace(
                 lower(translate("name", 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN')),
                 '[^a-z0-9]+', '-', 'g'
               )),
               ''
             ),
             'curso'
           ) AS base
    FROM "course"
  ) b
) s
WHERE c.id = s.id AND c."slug" IS NULL;--> statement-breakpoint

-- El temario pasa de la cohorte al curso: de las cohortes que declaran uno, se
-- toma el de la más reciente por fecha de inicio. 0015 borra la columna vieja.
UPDATE "course" c
SET "syllabus_url" = s.syllabus_url
FROM (
  SELECT DISTINCT ON (course_id) course_id, syllabus_url
  FROM "cohort"
  WHERE syllabus_url IS NOT NULL AND syllabus_url <> ''
  ORDER BY course_id, start_date DESC
) s
WHERE c.id = s.course_id AND c."syllabus_url" IS NULL;