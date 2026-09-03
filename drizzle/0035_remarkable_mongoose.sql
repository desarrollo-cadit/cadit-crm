ALTER TABLE "resource" DROP CONSTRAINT "resource_contenedor_unico";--> statement-breakpoint
ALTER TABLE "resource" ADD COLUMN "cohort_id" text;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "resource_org_cohort_idx" ON "resource" USING btree ("organization_id","cohort_id");--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_contenedor_unico" CHECK ((case when "resource"."course_id" is not null then 1 else 0 end)
        + (case when "resource"."cohort_id" is not null then 1 else 0 end)
        + (case when "resource"."class_session_id" is not null then 1 else 0 end) = 1);