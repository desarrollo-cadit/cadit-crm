-- 2026-10-19 — 040 Rol Ventas y datos de facturación de las empresas.
--
--   `company` (FR-004)
--     Nombre comercial, dirección fiscal, contacto de facturación, condición
--     de pago y notas. Todo NULL en las filas existentes: una empresa con solo
--     razón social y RUT sigue siendo válida. `company` ya tiene RLS
--     (`tenant_isolation`) desde la 0025; no hay tabla nueva.
--
--   Capacidades nuevas a los roles que ya existen
--     `empresas.editar` (DV-003): dirección, coordinación y administración.
--     `inscripciones.seguimiento` (DV-001): las escrituras que hasta hoy
--     colgaban de `inscripciones.ver` (mover un lead, el checklist, los
--     correos de la inscripción y el envío a toda la cohorte). Se la suma a
--     TODO rol que tiene `inscripciones.ver` —los de sistema por llave y los
--     creados a mano al final—, así que nadie pierde nada.
--
--   El rol `ventas` (FR-001)
--     Sembrado en las organizaciones que YA EXISTEN, igual que la 0036 con
--     `administracion`: `on conflict do nothing` (no pisa un rol que el dueño
--     ya haya creado con esa llave) e id determinístico. Las organizaciones
--     nuevas lo reciben de `SYSTEM_ROLES` al crearse. No mueve ninguna cuenta:
--     el rol queda DISPONIBLE para Ajustes → Equipo y Ajustes → Vendedores.
--     Las capacidades tienen que coincidir con `SYSTEM_ROLES`
--     (`tests/unit/seed-roles.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en columnas; CHECKs dentro
-- de `do $$` contra `pg_constraint`; cada `update` solo toca la fila a la que
-- le falta la capacidad.

alter table "company" add column if not exists "trade_name" text;--> statement-breakpoint
alter table "company" add column if not exists "address_street" text;--> statement-breakpoint
alter table "company" add column if not exists "address_city" text;--> statement-breakpoint
alter table "company" add column if not exists "address_state" text;--> statement-breakpoint
alter table "company" add column if not exists "address_country" text;--> statement-breakpoint
alter table "company" add column if not exists "billing_contact_name" text;--> statement-breakpoint
alter table "company" add column if not exists "billing_email" text;--> statement-breakpoint
alter table "company" add column if not exists "billing_phone" text;--> statement-breakpoint
alter table "company" add column if not exists "payment_terms" text;--> statement-breakpoint
alter table "company" add column if not exists "payment_term_days" integer;--> statement-breakpoint
alter table "company" add column if not exists "notes" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_payment_terms_valid') then
    alter table "company" add constraint "company_payment_terms_valid"
      check ("payment_terms" is null or "payment_terms" in ('contado', 'credito'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'company_payment_term_days_valid') then
    alter table "company" add constraint "company_payment_term_days_valid"
      check ("payment_term_days" is null or ("payment_terms" = 'credito' and "payment_term_days" between 1 and 365));
  end if;
end $$;--> statement-breakpoint

-- `empresas.editar` (DV-003).
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('empresas.editar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('empresas.editar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('empresas.editar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('empresas.editar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('empresas.editar'),
    "updated_at" = now()
where "key" = 'administracion'
  and not ("capabilities" @> jsonb_build_array('empresas.editar'));--> statement-breakpoint

-- `inscripciones.seguimiento` (DV-001) a los roles de sistema que tienen
-- `inscripciones.ver`. Se pregunta además por `inscripciones.ver`: si el dueño
-- se la sacó a un rol desde la pantalla, ese rol tampoco escribía.
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('inscripciones.seguimiento'),
    "updated_at" = now()
where "key" = 'direccion'
  and "capabilities" @> jsonb_build_array('inscripciones.ver')
  and not ("capabilities" @> jsonb_build_array('inscripciones.seguimiento'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('inscripciones.seguimiento'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and "capabilities" @> jsonb_build_array('inscripciones.ver')
  and not ("capabilities" @> jsonb_build_array('inscripciones.seguimiento'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('inscripciones.seguimiento'),
    "updated_at" = now()
where "key" = 'soporte'
  and "capabilities" @> jsonb_build_array('inscripciones.ver')
  and not ("capabilities" @> jsonb_build_array('inscripciones.seguimiento'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('inscripciones.seguimiento'),
    "updated_at" = now()
where "key" = 'administracion'
  and "capabilities" @> jsonb_build_array('inscripciones.ver')
  and not ("capabilities" @> jsonb_build_array('inscripciones.seguimiento'));--> statement-breakpoint

-- El rol `ventas`. Sin `inscripciones.seguimiento`: es la razón de ser de DV-001.
insert into "role" ("id", "organization_id", "key", "name", "capabilities", "system")
select
  'rol_' || substr(md5(o."id" || ':' || 'ventas'), 1, 20),
  o."id",
  'ventas',
  'Ventas',
  '["academico.ver","asistencia.ver","evaluacion.ver","contactos.ver","inscripciones.ver","empresas.editar"]'::jsonb,
  true
from "organization" o
on conflict ("organization_id", "key") do nothing;--> statement-breakpoint

-- Los roles creados a mano (`system = false`) con `inscripciones.ver` también
-- escribían: reciben `inscripciones.seguimiento` para no perder nada. Va AL
-- FINAL y sin filtrar por llave a propósito: `seed-roles.test.ts` empareja cada
-- `update` con la llave de su `where`, y este no es de ningún rol de sistema.
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('inscripciones.seguimiento'),
    "updated_at" = now()
where "system" = false
  and "capabilities" @> jsonb_build_array('inscripciones.ver')
  and not ("capabilities" @> jsonb_build_array('inscripciones.seguimiento'));
