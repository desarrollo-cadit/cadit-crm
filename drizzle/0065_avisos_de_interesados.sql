-- 2026-10-20 — Avisos de nuevos interesados.
--
--   `area_config`: área nueva `interesados` (Nuevos interesados)
--     Recibe el aviso de cada persona que deja sus datos en un formulario
--     público (página de un curso, formulario de campaña, inscripción a un
--     taller). No es un área de derivación del agente. Como Ventas, puede
--     llevar vendedores en copia: `area_config_sellers_only_ventas` (se
--     conserva el nombre) pasa a aceptar las dos.
--
--   `staff_notice`: aviso nuevo `interesado_nuevo`
--     `contact_id` (FK a contact, en cascada) es su sujeto; `payload` (jsonb)
--     congela lo que dice el correo al encolar. `staff_notice_subject_valid`
--     exige `contact_id` en ese tipo. La llave (`dedup_key`) es
--     `interesado_nuevo:<contactId>:<interés>:<día>` (`claveDeInteresado`).
--
-- RLS: no hay tabla nueva; `staff_notice` y `area_config` ya tienen
-- `tenant_isolation`. Se vuelve a declarar la de `staff_notice` (idempotente)
-- como en la 0062.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en columnas; los CHECK se
-- reemplazan solo si su definición no incluye todavía lo nuevo; la FK dentro de
-- `do $$` contra `pg_constraint`.

alter table "staff_notice" add column if not exists "contact_id" text;--> statement-breakpoint
alter table "staff_notice" add column if not exists "payload" jsonb;--> statement-breakpoint

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'area_config_area_valid'
      and pg_get_constraintdef(oid) not like '%interesados%'
  ) then
    alter table "area_config" drop constraint "area_config_area_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_config_area_valid') then
    alter table "area_config" add constraint "area_config_area_valid"
      check ("area" in ('ventas', 'soporte', 'administracion', 'interesados'));
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'area_config_sellers_only_ventas'
      and pg_get_constraintdef(oid) not like '%interesados%'
  ) then
    alter table "area_config" drop constraint "area_config_sellers_only_ventas";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'area_config_sellers_only_ventas') then
    alter table "area_config" add constraint "area_config_sellers_only_ventas"
      check ("area" in ('ventas', 'interesados') or cardinality("cc_seller_ids") = 0);
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'staff_notice_kind_valid'
      and pg_get_constraintdef(oid) not like '%interesado_nuevo%'
  ) then
    alter table "staff_notice" drop constraint "staff_notice_kind_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_kind_valid') then
    alter table "staff_notice" add constraint "staff_notice_kind_valid"
      check ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2',
                        'inscripcion_nueva', 'pago_registrado', 'morosidad_semanal',
                        'interesado_nuevo'));
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'staff_notice_subject_valid'
      and pg_get_constraintdef(oid) not like '%interesado_nuevo%'
  ) then
    alter table "staff_notice" drop constraint "staff_notice_subject_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_subject_valid') then
    alter table "staff_notice" add constraint "staff_notice_subject_valid"
      check (
        ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2') and "cohort_id" is not null)
        or ("kind" = 'inscripcion_nueva' and "enrollment_id" is not null)
        or ("kind" = 'pago_registrado' and "enrollment_id" is not null and "payment_id" is not null)
        or ("kind" = 'morosidad_semanal' and "period_key" is not null)
        or ("kind" = 'interesado_nuevo' and "contact_id" is not null)
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'staff_notice_contact_id_contact_id_fk') then
    alter table "staff_notice" add constraint "staff_notice_contact_id_contact_id_fk"
      foreign key ("contact_id") references "public"."contact"("id") on delete cascade on update no action;
  end if;
end $$;--> statement-breakpoint

alter table "staff_notice" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "staff_notice";--> statement-breakpoint
create policy tenant_isolation on "staff_notice"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
