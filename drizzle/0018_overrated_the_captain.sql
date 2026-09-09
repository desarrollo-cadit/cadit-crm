ALTER TABLE "cohort" ADD COLUMN "currency" text DEFAULT 'UYU' NOT NULL;--> statement-breakpoint
ALTER TABLE "course" ADD COLUMN "published" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollment" ADD COLUMN "currency" text DEFAULT 'UYU' NOT NULL;