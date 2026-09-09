DROP INDEX "course_module_course_idx";--> statement-breakpoint
CREATE INDEX "course_module_course_idx" ON "course_module" USING btree ("organization_id","course_id","position");