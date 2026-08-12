-- Backfill: instancias con contactos existentes tienen "name" pero
-- "first_name"/"last_name" en NULL (0012 los agregó nullable). Heurística de
-- primer espacio — SOLO para este backfill histórico, no para altas nuevas.
UPDATE "contact"
SET
  "first_name" = CASE
    WHEN position(' ' in "name") > 0 THEN substring("name" from 1 for position(' ' in "name") - 1)
    ELSE "name"
  END,
  "last_name" = CASE
    WHEN position(' ' in "name") > 0 THEN nullif(trim(substring("name" from position(' ' in "name") + 1)), '')
    ELSE NULL
  END
WHERE "first_name" IS NULL;--> statement-breakpoint
DROP INDEX "contact_org_name_idx";--> statement-breakpoint
ALTER TABLE "contact" ALTER COLUMN "first_name" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "contact_org_name_idx" ON "contact" USING btree ("organization_id","first_name");--> statement-breakpoint
ALTER TABLE "contact" DROP COLUMN "name";