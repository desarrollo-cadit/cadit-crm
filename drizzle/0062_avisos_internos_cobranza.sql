-- 2026-10-19 — 041 Avisos internos de cobranza (Administración).
--
--   `staff_notice` deja de ser solo "de una cohorte"
--     Tres avisos nuevos: `inscripcion_nueva` (uno por inscripción),
--     `pago_registrado` (uno por pago) y `morosidad_semanal` (uno por semana
--     ISO de la organización). La idempotencia pasa de UNIQUE
--     (organization_id, cohort_id, kind) a UNIQUE (organization_id, dedup_key).
--
--   Las filas de 039 NO cambian de sentido
--     `dedup_key` se rellena con `kind || ':' || cohort_id`, exactamente lo que
--     `claveDeAviso()` calcula para esos avisos: un aviso ya enviado sigue
--     siendo "ya enviado" con la llave nueva. Recién después se pone NOT NULL
--     y se reemplaza el índice único (en ese orden, para no dejar un instante
--     sin unicidad sobre filas sin llave).
--
--   `cohort_id` pasa a NULL-able; `staff_notice_subject_valid` exige la
--   columna de cada tipo (cohorte, inscripción, pago o semana).
--
-- RLS: la tabla ya tiene `tenant_isolation` desde la 0060; no hay tabla nueva.
-- Se vuelve a declarar igual (idempotente) para que la cobertura no dependa de
-- una migración vieja.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en columnas e índices;
-- FKs y CHECKs dentro de `do $$` contra `pg_constraint`; el backfill solo toca
-- las filas sin llave; el CHECK de tipos se compara contra su definición.

alter table "staff_notice" add column if not exists "enrollment_id" text;--> statement-breakpoint
alter table "staff_notice" add column if not exists "payment_id" text;--> statement-breakpoint
alter table "staff_notice" add column if not exists "period_key" text;--> statement-breakpoint
alter table "staff_notice" add column if not exists "dedup_key" text;--> statement-breakpoint

-- Backfill de las filas de 039 (las únicas que existen antes de esta migración).
update "staff_notice"
set "dedup_key" = "kind" || ':' || "cohort_id"
where "dedup_key" is null;--> statement-breakpoint

alter table "staff_notice" alter column "dedup_key" set not null;--> statement-breakpoint
alter table "staff_notice" alter column "cohort_id" drop not null;--> statement-breakpoint

create unique index if not exists "staff_notice_org_dedup_uq" on "staff_notice" using btree ("organization_id","dedup_key");--> statement-breakpoint
drop index if exists "staff_notice_org_cohort_kind_uq";--> statement-breakpoint
create index if not exists "staff_notice_org_cohort_idx" on "staff_notice" using btree ("organization_id","cohort_id");--> statement-breakpoint

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'staff_notice_kind_valid'
      and pg_get_constraintdef(oid) not like '%morosidad_semanal%'
  ) then
    alter table "staff_notice" drop constraint "staff_notice_kind_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_kind_valid') then
    alter table "staff_notice" add constraint "staff_notice_kind_valid"
      check ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2',
                        'inscripcion_nueva', 'pago_registrado', 'morosidad_semanal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_subject_valid') then
    alter table "staff_notice" add constraint "staff_notice_subject_valid"
      check (
        ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2') and "cohort_id" is not null)
        or ("kind" = 'inscripcion_nueva' and "enrollment_id" is not null)
        or ("kind" = 'pago_registrado' and "enrollment_id" is not null and "payment_id" is not null)
        or ("kind" = 'morosidad_semanal' and "period_key" is not null)
      );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_enrollment_id_enrollment_id_fk') then
    alter table "staff_notice" add constraint "staff_notice_enrollment_id_enrollment_id_fk"
      foreign key ("enrollment_id") references "public"."enrollment"("id") on delete cascade on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_payment_id_payment_id_fk') then
    alter table "staff_notice" add constraint "staff_notice_payment_id_payment_id_fk"
      foreign key ("payment_id") references "public"."payment"("id") on delete cascade on update no action;
  end if;
end $$;--> statement-breakpoint

alter table "staff_notice" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "staff_notice";--> statement-breakpoint
create policy tenant_isolation on "staff_notice"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
