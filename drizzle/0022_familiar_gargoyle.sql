CREATE TABLE "assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"required" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_result" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"assessment_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"passed" boolean,
	"notes" text,
	"recorded_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "certificate" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"code" text NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"issued_by" text,
	"attendance_pct" integer,
	"historical" boolean DEFAULT false NOT NULL,
	"revoked_at" timestamp,
	"revoked_by" text,
	"revoke_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "certificate_enrollment_id_unique" UNIQUE("enrollment_id"),
	CONSTRAINT "certificate_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment" ADD CONSTRAINT "assessment_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_issued_by_user_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificate" ADD CONSTRAINT "certificate_revoked_by_user_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assessment_org_cohort_idx" ON "assessment" USING btree ("organization_id","cohort_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_result_uq" ON "assessment_result" USING btree ("assessment_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "assessment_result_org_enrollment_idx" ON "assessment_result" USING btree ("organization_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "certificate_org_idx" ON "certificate" USING btree ("organization_id");