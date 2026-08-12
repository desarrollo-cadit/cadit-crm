ALTER TABLE "contact" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "first_name" text;--> statement-breakpoint
ALTER TABLE "contact" ADD COLUMN "last_name" text;