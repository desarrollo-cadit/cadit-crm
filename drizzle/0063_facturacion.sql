-- 2026-10-19 — 042 Facturación.
--
--   Autor de la factura y del recibo
--     `enrollment.invoice_recorded_at/_by`: cuándo y quién anotó (o corrigió,
--     o borró) el número de factura. `payment.receipt_recorded_at/_by`: lo
--     mismo para el número de recibo de un pago (el recibo es del PAGO desde
--     008, DV-006). Una corrección sin autor no se puede revisar. NULL en las
--     filas existentes: inventarles un autor sería peor. Sin tablas nuevas:
--     `enrollment` y `payment` ya tienen RLS (`tenant_isolation`).
--
--   `facturacion.editar` a los roles de sistema que ya existen
--     Dirección, coordinación y administración, por llave, cada `update` solo
--     toca la fila a la que le falta. Soporte y ventas no la reciben. Los
--     roles creados a mano no se tocan: quien tenía `inscripciones.editar`
--     sigue pudiendo cargar la factura por la ruta comercial, así que nadie
--     pierde nada; el dueño se la suma desde Ajustes → Roles si la quiere.
--     Las organizaciones nuevas la reciben de `SYSTEM_ROLES`
--     (`tests/unit/seed-roles.test.ts` verifica la suma).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en columnas; FKs dentro de
-- `do $$` contra `pg_constraint`.

alter table "enrollment" add column if not exists "invoice_recorded_at" timestamp;--> statement-breakpoint
alter table "enrollment" add column if not exists "invoice_recorded_by" text;--> statement-breakpoint
alter table "payment" add column if not exists "receipt_recorded_at" timestamp;--> statement-breakpoint
alter table "payment" add column if not exists "receipt_recorded_by" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'enrollment_invoice_recorded_by_user_id_fk') then
    alter table "enrollment" add constraint "enrollment_invoice_recorded_by_user_id_fk"
      foreign key ("invoice_recorded_by") references "public"."user"("id") on delete set null on update no action;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payment_receipt_recorded_by_user_id_fk') then
    alter table "payment" add constraint "payment_receipt_recorded_by_user_id_fk"
      foreign key ("receipt_recorded_by") references "public"."user"("id") on delete set null on update no action;
  end if;
end $$;--> statement-breakpoint

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('facturacion.editar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('facturacion.editar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('facturacion.editar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('facturacion.editar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('facturacion.editar'),
    "updated_at" = now()
where "key" = 'administracion'
  and not ("capabilities" @> jsonb_build_array('facturacion.editar'));
