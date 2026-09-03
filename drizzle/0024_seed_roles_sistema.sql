-- 012 (T018, DV-006) — Siembra los tres roles de sistema en cada organización.
--
-- IDEMPOTENTE por dos vías, y las dos hacen falta (constitución IV):
--
--   1. `on conflict do nothing` contra el único `role_org_key_uq`: correrla
--      dos veces no duplica ni pisa nada.
--   2. El `id` es DETERMINÍSTICO —derivado de organización + llave— así que
--      una segunda corrida ni siquiera genera una fila candidata distinta.
--      Con un id aleatorio, un `on conflict` mal escrito dejaría basura.
--
-- **No pisa lo editado.** Si la dueña ya le sacó una capacidad a coordinación
-- desde la pantalla, esta migración NO se la devuelve: solo inserta los roles
-- que faltan. Una semilla que reescribe la configuración de alguien es una
-- semilla que nadie puede correr tranquilo.
--
-- **Sembrar no cambia permisos de nadie todavía.** Las cuentas siguen con
-- `member.role` en 'owner' / 'member' / 'soporte'. Solo 'soporte' coincide con
-- una llave sembrada; 'owner' y 'member' no matchean y caen al respaldo en
-- código, que les da todo — igual que hoy. La migración de las cuentas a los
-- roles nuevos es T029, en la fase 6, y recién ahí coordinación pierde
-- `configuracion.editar`.
--
-- El `soporte` sembrado es "todas menos las tres financieras", que es lo que
-- soporte hace HOY (resolución de DV-006: "sin capacidades financieras, como
-- hoy"). Ver la corrección registrada en data-model.md.

insert into "role" ("id", "organization_id", "key", "name", "capabilities", "system")
select
  'rol_' || substr(md5(o."id" || ':' || r."key"), 1, 20),
  o."id",
  r."key",
  r."name",
  r."capabilities",
  true
from "organization" o
cross join (
  values
    (
      'direccion',
      'Dirección',
      '["academico.ver","academico.editar","asistencia.ver","asistencia.editar","evaluacion.ver","evaluacion.editar","certificados.emitir","contactos.ver","contactos.editar","inscripciones.ver","inscripciones.editar","cobranza.ver","cobranza.editar","inbox.ver","inbox.responder","configuracion.editar","accesos.gestionar"]'::jsonb
    ),
    (
      'coordinacion',
      'Coordinación',
      '["academico.ver","academico.editar","asistencia.ver","asistencia.editar","evaluacion.ver","evaluacion.editar","certificados.emitir","contactos.ver","contactos.editar","inscripciones.ver","inscripciones.editar","cobranza.ver","cobranza.editar","inbox.ver","inbox.responder","accesos.gestionar"]'::jsonb
    ),
    (
      'soporte',
      'Soporte',
      '["academico.ver","academico.editar","asistencia.ver","asistencia.editar","evaluacion.ver","evaluacion.editar","certificados.emitir","contactos.ver","contactos.editar","inscripciones.ver","inbox.ver","inbox.responder","configuracion.editar","accesos.gestionar"]'::jsonb
    )
) as r("key", "name", "capabilities")
on conflict ("organization_id", "key") do nothing;
