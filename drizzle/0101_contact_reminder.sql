-- 0101 — Recordatorios de seguimiento sobre un contacto.
--
-- `due_date` es un día de calendario en la zona de la organización. Sin
-- backfill: nace vacía. El correo del día lo reclama `staff_notice` (no hay
-- columna de reclamo acá: `email_sent_at` solo deja constancia).
--
-- RLS: nace con `tenant_isolation` (`db:generate` no genera políticas;
-- `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índices; las FKs
-- dentro de un `do $$` contra `pg_constraint`; política con `drop ... if exists`.

create table if not exists "contact_reminder" (
	"id" text primary key not null,
	"organization_id" text not null,
	"contact_id" text not null,
	"author_user_id" text,
	"reason" text not null,
	"due_date" date not null,
	"done_at" timestamp,
	"done_by_user_id" text,
	"email_sent_at" timestamp,
	"created_at" timestamp default now() not null,
	constraint "contact_reminder_reason_len" check (length(trim("contact_reminder"."reason")) between 1 and 500)
);--> statement-breakpoint

do $$
declare
  f record;
begin
  for f in
    select * from (values
      ('contact_reminder', 'contact_reminder_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('contact_reminder', 'contact_reminder_contact_id_contact_id_fk', 'contact_id', 'contact', 'cascade'),
      ('contact_reminder', 'contact_reminder_author_user_id_user_id_fk', 'author_user_id', 'user', 'set null'),
      ('contact_reminder', 'contact_reminder_done_by_user_id_user_id_fk', 'done_by_user_id', 'user', 'set null')
    ) as t(tabla, nombre, columna, referida, accion)
  loop
    if not exists (select 1 from pg_constraint where conname = f.nombre) then
      execute format(
        'alter table %I add constraint %I foreign key (%I) references public.%I("id") on delete %s on update no action',
        f.tabla, f.nombre, f.columna, f.referida, f.accion
      );
    end if;
  end loop;
end $$;--> statement-breakpoint

create index if not exists "contact_reminder_org_due_pending_idx" on "contact_reminder" using btree ("organization_id","due_date") where "contact_reminder"."done_at" is null;--> statement-breakpoint
create index if not exists "contact_reminder_org_contact_idx" on "contact_reminder" using btree ("organization_id","contact_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "contact_reminder" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "contact_reminder";--> statement-breakpoint
create policy tenant_isolation on "contact_reminder"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
--> statement-breakpoint

-- `staff_notice`: un tipo nuevo, `recordatorio_contacto` (el correo al AUTOR
-- del recordatorio el día que vence). Cuelga del contacto (`contact_id`, como
-- `interesado_nuevo`); la llave es `<tipo>:<contactId>:<recordatorioId>:<día>`.
-- RLS: `staff_notice` ya tiene `tenant_isolation`. Los CHECK se reemplazan solo
-- si su definición no incluye todavía lo nuevo (re-ejecutable).
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'staff_notice_kind_valid'
      and pg_get_constraintdef(oid) not like '%recordatorio_contacto%'
  ) then
    alter table "staff_notice" drop constraint "staff_notice_kind_valid";
  end if;
  if not exists (select 1 from pg_constraint where conname = 'staff_notice_kind_valid') then
    alter table "staff_notice" add constraint "staff_notice_kind_valid"
      check ("kind" in ('cohorte_confirmada', 'facturacion_t7', 'facturacion_t2',
                        'inscripcion_nueva', 'pago_registrado', 'morosidad_semanal',
                        'interesado_nuevo',
                        'sin_confirmar_t7', 'sin_confirmar_t2', 'sin_confirmar_inicio',
                        'recordatorio_contacto'));
  end if;

  if exists (
    select 1 from pg_constraint
    where conname = 'staff_notice_subject_valid'
      and pg_get_constraintdef(oid) not like '%recordatorio_contacto%'
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
        or ("kind" in ('interesado_nuevo', 'recordatorio_contacto') and "contact_id" is not null)
      );
  end if;
end $$;
