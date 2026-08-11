DROP TABLE "lead" CASCADE;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "utm_campaign" text;