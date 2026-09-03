CREATE TABLE "attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"class_session_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"status" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "class_session" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"number" integer NOT NULL,
	"date" timestamp NOT NULL,
	"start_time" text,
	"end_time" text,
	"hours" integer,
	"teacher_id" text,
	"topic" text,
	"canceled_at" timestamp,
	"cancel_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "installment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"number" integer NOT NULL,
	"due_date" timestamp NOT NULL,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'UYU' NOT NULL,
	"canceled_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"enrollment_id" text NOT NULL,
	"installment_id" text,
	"amount" integer NOT NULL,
	"currency" text DEFAULT 'UYU' NOT NULL,
	"paid_at" timestamp NOT NULL,
	"method" text NOT NULL,
	"receipt_number" text,
	"notes" text,
	"recorded_by" text,
	"voided_at" timestamp,
	"voided_by" text,
	"void_reason" text,
	"idempotency_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "min_attendance_pct" integer;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "min_attendance_pct" integer;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_class_session_id_class_session_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment" ADD CONSTRAINT "installment_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_enrollment_id_enrollment_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_installment_id_installment_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installment"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment" ADD CONSTRAINT "payment_voided_by_user_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_session_enrollment_uq" ON "attendance" USING btree ("class_session_id","enrollment_id");--> statement-breakpoint
CREATE INDEX "attendance_org_enrollment_idx" ON "attendance" USING btree ("organization_id","enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_session_cohort_number_uq" ON "class_session" USING btree ("organization_id","cohort_id","number");--> statement-breakpoint
CREATE INDEX "class_session_org_date_idx" ON "class_session" USING btree ("organization_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "installment_enrollment_number_uq" ON "installment" USING btree ("organization_id","enrollment_id","number");--> statement-breakpoint
CREATE INDEX "installment_org_due_idx" ON "installment" USING btree ("organization_id","due_date");--> statement-breakpoint
CREATE INDEX "payment_org_paid_idx" ON "payment" USING btree ("organization_id","paid_at");--> statement-breakpoint
CREATE INDEX "payment_org_enrollment_idx" ON "payment" USING btree ("organization_id","enrollment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_org_idempotency_uq" ON "payment" USING btree ("organization_id","idempotency_key") WHERE "payment"."idempotency_key" IS NOT NULL;