ALTER TABLE "class_session" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "class_session" ADD COLUMN "recording_url" text;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "meeting_url" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "timezone" text DEFAULT 'America/Montevideo' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "meeting_open_before_min" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "meeting_open_after_min" integer DEFAULT 30 NOT NULL;