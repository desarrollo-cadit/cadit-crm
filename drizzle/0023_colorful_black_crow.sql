CREATE TABLE "account_link" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"contact_id" text,
	"teacher_id" text,
	"suspended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "account_link_kind_coherente" CHECK (("account_link"."kind" = 'alumno' and "account_link"."contact_id" is not null and "account_link"."teacher_id" is null)
       or ("account_link"."kind" = 'profesor' and "account_link"."teacher_id" is not null and "account_link"."contact_id" is null))
);
--> statement-breakpoint
CREATE TABLE "role" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_link" ADD CONSTRAINT "account_link_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_link" ADD CONSTRAINT "account_link_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_link" ADD CONSTRAINT "account_link_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "account_link" ADD CONSTRAINT "account_link_teacher_id_teacher_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role" ADD CONSTRAINT "role_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_link_org_user_kind_uq" ON "account_link" USING btree ("organization_id","user_id","kind");--> statement-breakpoint
CREATE INDEX "account_link_org_contact_idx" ON "account_link" USING btree ("organization_id","contact_id");--> statement-breakpoint
CREATE INDEX "account_link_org_teacher_idx" ON "account_link" USING btree ("organization_id","teacher_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_org_key_uq" ON "role" USING btree ("organization_id","key");