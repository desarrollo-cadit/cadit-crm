-- 2026-10-29 — Decisión del dueño (2026-10-23): ninguna aprobación es automática.
--
--   `enrollment_final_result`: el resultado final de una cursada
--   (`aprobado | reprobado`), CONFIRMADO por el profesor del grupo (o por
--   Coordinación con `correcciones.aprobar`) cuando el grupo terminó. El
--   cálculo de notas + asistencia queda como sugerencia y se guarda al
--   confirmar en `suggested_result`.
--
-- No hay backfill A PROPÓSITO: todo grupo, también los ya terminados, vuelve a
-- "pendiente de confirmación". Los certificados ya emitidos quedan SUSPENDIDOS
-- (el alumno no los ve y `/verificar` no los valida) hasta que se confirme el
-- resultado; eso se decide al leer, sin tocar la tabla `certificate`.
--
-- RLS: la tabla nueva nace con `tenant_isolation` (`db:generate` no genera
-- políticas; `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índice; FKs
-- dentro de `do $$` contra `pg_constraint`.

create table if not exists "enrollment_final_result" (
	"id" text primary key not null,
	"organization_id" text not null,
	"enrollment_id" text not null,
	"result" text not null,
	"suggested_result" text not null,
	"note" text,
	"confirmed_by" text,
	"confirmed_at" timestamp default now() not null,
	"created_at" timestamp default now() not null,
	"updated_at" timestamp default now() not null,
	constraint "enrollment_final_result_enrollment_id_unique" unique("enrollment_id"),
	constraint "enrollment_final_result_result_valid" check ("enrollment_final_result"."result" in ('aprobado', 'reprobado')),
	constraint "enrollment_final_result_suggested_valid" check ("enrollment_final_result"."suggested_result" in ('aprobado', 'reprobado', 'pendiente'))
);--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enrollment_final_result_organization_id_organization_id_fk') then
    alter table "enrollment_final_result" add constraint "enrollment_final_result_organization_id_organization_id_fk"
      foreign key ("organization_id") references "public"."organization"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_final_result_enrollment_id_enrollment_id_fk') then
    alter table "enrollment_final_result" add constraint "enrollment_final_result_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_final_result_confirmed_by_user_id_fk') then
    alter table "enrollment_final_result" add constraint "enrollment_final_result_confirmed_by_user_id_fk"
      foreign key ("confirmed_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

create index if not exists "enrollment_final_result_org_idx" on "enrollment_final_result" using btree ("organization_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "enrollment_final_result" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "enrollment_final_result";--> statement-breakpoint
create policy tenant_isolation on "enrollment_final_result"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
