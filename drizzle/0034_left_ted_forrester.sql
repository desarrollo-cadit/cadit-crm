CREATE TABLE "virtual_room" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"account_email" text,
	"notes" text,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "class_session" ADD COLUMN "virtual_room_id" text;--> statement-breakpoint
ALTER TABLE "cohort" ADD COLUMN "virtual_room_id" text;--> statement-breakpoint
ALTER TABLE "virtual_room" ADD CONSTRAINT "virtual_room_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "virtual_room_org_idx" ON "virtual_room" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "virtual_room_org_name_uq" ON "virtual_room" USING btree ("organization_id","name");--> statement-breakpoint
ALTER TABLE "class_session" ADD CONSTRAINT "class_session_virtual_room_id_virtual_room_id_fk" FOREIGN KEY ("virtual_room_id") REFERENCES "public"."virtual_room"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort" ADD CONSTRAINT "cohort_virtual_room_id_virtual_room_id_fk" FOREIGN KEY ("virtual_room_id") REFERENCES "public"."virtual_room"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

-- 023 — RLS para `virtual_room`.
--
-- `db:generate` produce tablas e índices y las deja SIN política: una tabla de
-- dominio nueva sin esto queda visible para cualquier organización, y el
-- síntoma no aparece hasta que haya una segunda. `tests/unit/rls-cobertura.test.ts`
-- falla si alguien se olvida — este bloque es lo que ese test exige.
--
-- Mismo criterio que 0025: `current_setting(..., true)` devuelve NULL cuando
-- nadie declaró la organización, y comparar contra NULL da falso. Una conexión
-- que no declaró alcance no ve NINGUNA fila: falla cerrado, no abierto.
--
-- `with check` va explícito aunque Postgres reusaría `using`: en una política
-- de seguridad, entender qué protege no puede depender de recordar una regla
-- del manual. Sin él, un INSERT podría escribir filas de otra organización.
alter table "virtual_room" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "virtual_room";--> statement-breakpoint
create policy tenant_isolation on "virtual_room"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
