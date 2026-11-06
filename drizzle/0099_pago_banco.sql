-- 2026-11-06 — Seguimiento de pagos desde Facturación.
--
--   1. `payment.bank`: el banco (o cuenta) por donde entró el pago. Nulo en los
--      pagos existentes: inventarles un banco sería peor que no tenerlo.
--   2. `cobranza.registrar`: capacidad nueva para CARGAR el plan de cuotas y los
--      pagos sin poder anularlos ni corregirlos (eso sigue siendo
--      `cobranza.editar`). La reciben dirección, coordinación y administración
--      (los roles de sistema que la declaran en `SYSTEM_ROLES`) y todo rol
--      creado a mano que ya tenía `cobranza.editar`, así que nadie pierde nada.
--      Soporte no.
--
-- RE-EJECUTABLE (constitución IV): IF NOT EXISTS y `not (… @> …)`.

ALTER TABLE "payment" ADD COLUMN IF NOT EXISTS "bank" text;--> statement-breakpoint

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cobranza.registrar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('cobranza.registrar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cobranza.registrar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('cobranza.registrar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cobranza.registrar'),
    "updated_at" = now()
where "key" = 'administracion'
  and not ("capabilities" @> jsonb_build_array('cobranza.registrar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cobranza.registrar'),
    "updated_at" = now()
where "system" = false
  and "capabilities" @> jsonb_build_array('cobranza.editar')
  and not ("capabilities" @> jsonb_build_array('cobranza.registrar'));--> statement-breakpoint
