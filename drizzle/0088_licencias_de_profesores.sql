-- 2026-10-30 — Licencias de profesores.
--
-- Hasta acá `license` colgaba SIEMPRE de una inscripción, y un profesor (que
-- no tiene inscripción ni cohorte) no podía tener una. Ahora cuelga de una
-- inscripción O de un profesor, exactamente una:
--
--   1. `license.enrollment_id` pasa a admitir NULL.
--   2. `license.teacher_id` (FK a `teacher`, cascade: dar de baja al profesor
--      libera su asiento).
--   3. CHECK `license_un_titular`: uno y solo uno de los dos.
--   4. Una licencia por programa y por profesor (índice único), como ya había
--      una por programa y por inscripción. Los NULL no chocan entre sí.
--
-- Las filas existentes tienen `enrollment_id` y `teacher_id` NULL → cumplen el
-- CHECK sin tocarlas. Sin RLS nuevo: `license` ya tiene `tenant_isolation`.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en columnas e índices;
-- FK y CHECK dentro de `do $$` contra `pg_constraint`; `drop not null` no
-- falla si ya está suelto.

alter table "license" alter column "enrollment_id" drop not null;--> statement-breakpoint
alter table "license" add column if not exists "teacher_id" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'license_teacher_id_teacher_id_fk') then
    alter table "license" add constraint "license_teacher_id_teacher_id_fk"
      foreign key ("teacher_id") references "public"."teacher"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'license_un_titular') then
    alter table "license" add constraint "license_un_titular"
      check (num_nonnulls("license"."enrollment_id", "license"."teacher_id") = 1);
  end if;
end $$;--> statement-breakpoint

create unique index if not exists "license_teacher_software_uq" on "license" using btree ("teacher_id","software_id");--> statement-breakpoint
create index if not exists "license_teacher_idx" on "license" using btree ("teacher_id");
