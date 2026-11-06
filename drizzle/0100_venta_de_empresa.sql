-- 2026-11-06 — Venta de empresa: una empresa que paga un total por varios
-- alumnos del mismo grupo se gestiona UNA vez (total, cuotas y pagos en la
-- inscripción titular); las demás apuntan a ella con `billing_enrollment_id`.
--
-- La columna es nula en todas las filas existentes: ninguna inscripción cambia
-- de comportamiento hasta que alguien pase un grupo a venta única.
--
-- RE-EJECUTABLE (constitución IV): IF NOT EXISTS y bloque con duplicate_object.

ALTER TABLE "enrollment" ADD COLUMN IF NOT EXISTS "billing_enrollment_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "enrollment" ADD CONSTRAINT "enrollment_billing_enrollment_id_enrollment_id_fk" FOREIGN KEY ("billing_enrollment_id") REFERENCES "public"."enrollment"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "enrollment_billing_enrollment_idx" ON "enrollment" USING btree ("billing_enrollment_id");--> statement-breakpoint
