CREATE TABLE "announcement" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"cohort_id" text NOT NULL,
	"author_user_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"course_id" text,
	"class_session_id" text,
	"course_module_id" text,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"kind" text DEFAULT 'enlace' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resource_contenedor_unico" CHECK (("resource"."course_id" is not null and "resource"."class_session_id" is null)
       or ("resource"."class_session_id" is not null and "resource"."course_id" is null))
);
--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_cohort_id_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement" ADD CONSTRAINT "announcement_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_course_id_course_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."course"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_class_session_id_class_session_id_fk" FOREIGN KEY ("class_session_id") REFERENCES "public"."class_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource" ADD CONSTRAINT "resource_course_module_id_course_module_id_fk" FOREIGN KEY ("course_module_id") REFERENCES "public"."course_module"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "announcement_org_cohort_idx" ON "announcement" USING btree ("organization_id","cohort_id","created_at");--> statement-breakpoint
CREATE INDEX "resource_org_course_idx" ON "resource" USING btree ("organization_id","course_id");--> statement-breakpoint
CREATE INDEX "resource_org_class_idx" ON "resource" USING btree ("organization_id","class_session_id");--> statement-breakpoint

-- ============================================================
-- 013 (T019) — RLS para las dos tablas nuevas.
-- ============================================================
-- Drizzle NO genera esto: `db:generate` produce las tablas y los índices, y
-- las políticas quedan afuera. Si nadie las agrega a mano, `resource` y
-- `announcement` nacen SIN la red que la migración 0025 le puso a las otras
-- 31 tablas de dominio — y ese olvido no se nota hasta que es tarde, porque
-- todo funciona igual mientras haya una sola organización.
--
-- Misma política que el resto: `current_setting(..., true)` devuelve NULL si
-- nadie declaró organización, y comparar contra NULL da falso. Una conexión
-- sin alcance declarado no ve ninguna fila (FR-015 de 012).
--
-- `with check` va explícito aunque Postgres reusaría `using`: entender qué
-- protege una política de seguridad no puede depender de recordar una regla
-- del manual.

alter table "resource" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "resource";--> statement-breakpoint
create policy tenant_isolation on "resource"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "announcement" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "announcement";--> statement-breakpoint
create policy tenant_isolation on "announcement"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
