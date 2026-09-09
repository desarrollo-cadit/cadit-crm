-- 005 iteración 7 — curso de interés del lead como FK (antes solo existía
-- como texto en `contact.source`, p. ej. "formulario:Landing Revit").
-- Las filas existentes quedan en NULL: el origen viejo sigue legible en
-- `contact.source` y no se intenta adivinar a qué curso correspondía.
ALTER TABLE "enrollment" ADD COLUMN "interest_course_id" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_interest_course_id_course_id_fk" FOREIGN KEY ("interest_course_id") REFERENCES "public"."course"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "enrollment_org_interest_course_idx" ON "enrollment" USING btree ("organization_id","interest_course_id");