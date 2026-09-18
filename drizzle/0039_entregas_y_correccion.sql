-- 016 — Entregas y corrección: el trabajo del alumno, y la devolución.
--
-- Dos tablas nuevas y una columna. Qué agrega y por qué:
--
--   `assessment.due_at` (FR-005, FR-005e)
--     La fecha límite de TODA la cohorte, como INSTANTE y no como un día con
--     un "23:59" colgando. Se compone con `classInstant()` en la zona de la
--     organización, igual que el horario de una clase: un "23:59" sin zona
--     cierra el plazo antes de hora para los 87 alumnos que cursan desde fuera
--     de Uruguay. NULL = sin plazo, que es un estado legítimo (DV-001).
--
--   `submission` (FR-001..FR-004, FR-007, FR-008, FR-010, FR-013)
--     La entrega: un ENLACE, nunca un archivo (decisión marco, constitución
--     II). Cuelga de la INSCRIPCIÓN —la del módulo en un programa (FR-012)— y
--     hay UNA FILA POR INTENTO: la reentrega inserta, no pisa, así que el
--     historial queda (FR-008). Por eso NO lleva índice único por evaluación e
--     inscripción: ese índice es exactamente lo que impediría el historial.
--     `feedback` es columna propia (FR-011): la devolución la lee el alumno y
--     `assessment_result.notes` es la nota INTERNA del staff.
--     `reopened_at` es el permiso de reentregar: un ESTADO, no un contador
--     (FR-013, DV-003).
--
--   `assessment_extension` (FR-005b, FR-005c)
--     La prórroga individual: la fecha de UNA persona en UNA evaluación, con
--     quién la otorgó y por qué. Nunca una fecha suelta — sin autor ni motivo
--     una excepción es indistinguible de un error de carga. Índice ÚNICO por
--     evaluación e inscripción: volver a otorgarla CORRIGE, no acumula dos
--     fechas sobre la misma entrega (constitución IV).
--
-- ============================================================
-- RLS: ACÁ SÍ HAY QUE ESCRIBIRLA A MANO (y es el error que más se olvida)
-- ============================================================
-- `pnpm db:generate` produce tablas, columnas e índices y deja las políticas
-- AFUERA. Esta migración agrega DOS tablas de dominio con `organization_id`,
-- así que las dos necesitan `enable row level security` + la política
-- `tenant_isolation`, escritas acá abajo. `tests/unit/rls-cobertura.test.ts`
-- falla si faltan.
--
-- La política es la MISMA de la 0025, letra por letra:
-- `current_setting(..., true)` devuelve NULL si nadie declaró la organización,
-- y comparar contra NULL da falso — una conexión sin `app.current_org` no ve
-- NINGUNA fila. Falla cerrado, no abierto. El `with check` va explícito aunque
-- Postgres reusaría `using`: sin él, un INSERT podría escribir filas de otra
-- organización.
--
-- Los PERMISOS de `cadit_app` no se tocan y no es un olvido: la 0026 dejó
-- `alter default privileges ... grant select, insert, update, delete on tables`
-- justamente para que la próxima tabla no naciera invisible para la app.
--
-- ============================================================
-- RE-EJECUTABLE (constitución IV, Principio IV)
-- ============================================================
-- `create table if not exists`, `add column if not exists`,
-- `create index if not exists`, las FK dentro de un `do $$` que consulta
-- `pg_constraint` —`add constraint` no acepta `if not exists`— y la política
-- borrada antes de crearse, porque `create policy` tampoco lo acepta.
--
-- ============================================================
-- SIN REGRESIÓN
-- ============================================================
-- `assessment.due_at` es NULLABLE y sin DEFAULT: las evaluaciones que ya
-- existen quedan sin plazo, que es el comportamiento de hoy (DV-001). No hay
-- UPDATE, no hay backfill y no hay fecha inventada para nadie.

alter table "assessment" add column if not exists "due_at" timestamp;--> statement-breakpoint

create table if not exists "submission" (
  "id" text primary key not null,
  "organization_id" text not null,
  "assessment_id" text not null,
  "enrollment_id" text not null,
  "url" text not null,
  "title" text,
  "submitted_at" timestamp DEFAULT now() NOT NULL,
  "passed" boolean,
  "feedback" text,
  "corrected_at" timestamp,
  "corrected_by" text,
  "reopened_at" timestamp,
  "reopened_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

create table if not exists "assessment_extension" (
  "id" text primary key not null,
  "organization_id" text not null,
  "assessment_id" text not null,
  "enrollment_id" text not null,
  "due_at" timestamp not null,
  "reason" text not null,
  "granted_by" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Las claves foráneas. `cascade` hacia la organización, la evaluación y la
-- inscripción: borrada la evaluación, sus entregas no significan nada.
-- `set null` en los autores, igual que en `certificate.issued_by`: que alguien
-- deje la academia no borra la corrección que firmó.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'submission_organization_id_organization_id_fk') then
    alter table "submission" add constraint "submission_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'submission_assessment_id_assessment_id_fk') then
    alter table "submission" add constraint "submission_assessment_id_assessment_id_fk"
      foreign key ("assessment_id") references "public"."assessment"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'submission_enrollment_id_enrollment_id_fk') then
    alter table "submission" add constraint "submission_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'submission_corrected_by_user_id_fk') then
    alter table "submission" add constraint "submission_corrected_by_user_id_fk"
      foreign key ("corrected_by") references "public"."user"("id")
      on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'submission_reopened_by_user_id_fk') then
    alter table "submission" add constraint "submission_reopened_by_user_id_fk"
      foreign key ("reopened_by") references "public"."user"("id")
      on delete set null on update no action;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_organization_id_organization_id_fk') then
    alter table "assessment_extension" add constraint "assessment_extension_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_assessment_id_assessment_id_fk') then
    alter table "assessment_extension" add constraint "assessment_extension_assessment_id_assessment_id_fk"
      foreign key ("assessment_id") references "public"."assessment"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_enrollment_id_enrollment_id_fk') then
    alter table "assessment_extension" add constraint "assessment_extension_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id")
      on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'assessment_extension_granted_by_user_id_fk') then
    alter table "assessment_extension" add constraint "assessment_extension_granted_by_user_id_fk"
      foreign key ("granted_by") references "public"."user"("id")
      on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

-- Por acá se lee el historial de una persona en una evaluación (y de ahí sale
-- la entrega VIGENTE: la más reciente), y por acá la pantalla del profesor.
-- Org primero, como el resto de las tablas de dominio.
create index if not exists "submission_org_assessment_enrollment_idx" on "submission" using btree ("organization_id","assessment_id","enrollment_id","submitted_at");--> statement-breakpoint
create index if not exists "submission_org_assessment_idx" on "submission" using btree ("organization_id","assessment_id");--> statement-breakpoint
create unique index if not exists "assessment_extension_uq" on "assessment_extension" using btree ("assessment_id","enrollment_id");--> statement-breakpoint
create index if not exists "assessment_extension_org_enrollment_idx" on "assessment_extension" using btree ("organization_id","enrollment_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "submission" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "submission";--> statement-breakpoint
create policy tenant_isolation on "submission"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));--> statement-breakpoint

alter table "assessment_extension" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "assessment_extension";--> statement-breakpoint
create policy tenant_isolation on "assessment_extension"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
