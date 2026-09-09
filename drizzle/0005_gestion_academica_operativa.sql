CREATE TABLE "cohort_software" (
	"cohort_id" text NOT NULL,
	"software_id" text NOT NULL,
	CONSTRAINT "cohort_software_cohort_id_software_id_pk" PRIMARY KEY("cohort_id","software_id")
);
--> statement-breakpoint
CREATE TABLE "company" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"legal_name" text NOT NULL,
	"tax_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "software" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"total_licenses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "teacher" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "teacher_id" text;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "cost" integer;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "frequency" text;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "classroom" text;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "syllabus_url" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "national_id" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "amount" integer;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "installments" integer;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "payment_notes" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "national_id" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "invoice_number" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "receipt_number" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "seller_id" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "company_id" text;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "terms_email_sent_at" timestamp;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "software_installed_at" timestamp;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "had_own_license" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "academia_online_access_at" timestamp;--> statement-breakpoint
ALTER TABLE "license" ADD COLUMN "software_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "cohort_software" ADD CONSTRAINT "cohort_software_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_software" ADD CONSTRAINT "cohort_software_software_id_software_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."software"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company" ADD CONSTRAINT "company_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "software" ADD CONSTRAINT "software_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher" ADD CONSTRAINT "teacher_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cohort_software_software_idx" ON "cohort_software" USING btree ("software_id");--> statement-breakpoint
CREATE INDEX "company_org_idx" ON "company" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "software_org_idx" ON "software" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "teacher_org_idx" ON "teacher" USING btree ("organization_id");--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_company_id_company_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."company"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "license" ADD CONSTRAINT "license_software_id_software_id_fk" FOREIGN KEY ("software_id") REFERENCES "public"."software"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cohort_teacher_idx" ON "cohort" USING btree ("teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_org_email_uq" ON "contact" USING btree ("organization_id","email") WHERE "contact"."email" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contact_org_phone_uq" ON "contact" USING btree ("organization_id","phone") WHERE "contact"."phone" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "enrollment_seller_idx" ON "enrollment" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "enrollment_company_idx" ON "enrollment" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "license_software_idx" ON "license" USING btree ("software_id");