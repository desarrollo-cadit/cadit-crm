-- 2026-10-22 — Avisos de grupos sin confirmar.
--
--   `staff_notice`: tres tipos nuevos, `sin_confirmar_t7`, `sin_confirmar_t2`
--     y `sin_confirmar_inicio`. Van a quienes tienen la capacidad
--     `cohortes.confirmar` cuando un grupo (no taller, no módulo) llega a T-7,
--     T-2 o a su día de inicio sin confirmar. Son avisos de una cohorte:
--     `staff_notice_subject_valid` les exige `cohort_id`. La llave
--     (`dedup_key`) es `<tipo>:<cohortId>:<YYYY-MM-DD del inicio>`: si el
--     grupo se reprograma, las ventanas de la fecha nueva vuelven a avisar.
--
-- RLS: no hay tabla nueva; `staff_notice` ya tiene `tenant_isolation`. Se
-- vuelve a declarar (idempotente) como en la 0062 y la 0065.
--
-- RE-EJECUTABLE (constitución IV): los CHECK se reemplazan solo si su
-- definición no incluye todavía lo nuevo.

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'staff_notice_kind_valid'
      and pg_get_constraintdef(oid) not like '%sin_confirmar_inicio%'
  ) then
    alter table "staff_notice" drop constraint "staff_notice_kind_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_kind_valid') then
    alter table "staff_notice" add constraint "staff_notice_kind_valid"
      check ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2',
                        'inscripcion_nueva', 'pago_registrado', 'morosidad_semanal',
                        'interesado_nuevo',
                        'sin_confirmar_t7', 'sin_confirmar_t2', 'sin_confirmar_inicio'));
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'staff_notice_subject_valid'
      and pg_get_constraintdef(oid) not like '%sin_confirmar_inicio%'
  ) then
    alter table "staff_notice" drop constraint "staff_notice_subject_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_subject_valid') then
    alter table "staff_notice" add constraint "staff_notice_subject_valid"
      check (
        ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2',
                    'sin_confirmar_t7', 'sin_confirmar_t2', 'sin_confirmar_inicio')
          and "cohort_id" is not null)
        or ("kind" = 'inscripcion_nueva' and "enrollment_id" is not null)
        or ("kind" = 'pago_registrado' and "enrollment_id" is not null and "payment_id" is not null)
        or ("kind" = 'morosidad_semanal' and "period_key" is not null)
        or ("kind" = 'interesado_nuevo' and "contact_id" is not null)
      );
  end if;
end $$;--> statement-breakpoint

alter table "staff_notice" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "staff_notice";--> statement-breakpoint
create policy tenant_isolation on "staff_notice"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
