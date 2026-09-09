-- 026 (FR-002/FR-003) — Siembra el rol `administracion` en las organizaciones
-- que YA EXISTEN.
--
-- Por qué hace falta una migración y no alcanza el código: `on-signup.ts`
-- siembra `SYSTEM_ROLES` **al crear la organización**. La organización real
-- —la de los 340 alumnos y las 41 cohortes— se creó hace meses, así que sin
-- esto nunca tendría el rol nuevo y `/settings/roles` seguiría mostrando tres.
--
-- Agregar el rol a la base y no a `capabilitiesFor()` es deliberado: ese mapa
-- de código no tiene ni `direccion` ni `coordinacion` (FR-004), y sumar una
-- cuarta fuente de verdad sería crear algo capaz de divergir de la base sin
-- que nadie lo note. El rol funciona por su fila, como los otros dos.
--
-- ============================================================
-- RE-EJECUTABLE (constitución IV), por las dos vías de la 0024
-- ============================================================
--   1. `on conflict ("organization_id","key") do nothing`: correrla dos veces
--      no duplica NI PISA. Si el dueño ya le sacó `academico.ver` al rol desde
--      `/settings/roles`, una segunda corrida NO se la devuelve. Una semilla
--      que reescribe la configuración de alguien es una semilla que nadie
--      puede correr tranquilo: por eso el conflicto se descarta en vez de
--      reescribir la fila. Actualizarla acá deshace configuración humana.
--   2. El `id` es DETERMINÍSTICO, derivado de organización + llave: una
--      segunda corrida ni siquiera genera una fila candidata distinta. Con un
--      id aleatorio, un `on conflict` mal escrito dejaría basura.
--
-- ============================================================
-- Lo que esta migración NO hace
-- ============================================================
-- No mueve ninguna cuenta a `administracion` y no le quita nada a nadie. Deja
-- el rol DISPONIBLE para que el dueño se lo asigne a quien corresponda desde
-- Ajustes → Equipo. Migrar cuentas es una decisión de personas, no de esquema.
--
-- Tampoco crea ninguna tabla: la marca de "transcrito" (DV-001) se resolvió
-- con la alternativa barata —acotar por rango de fechas—, así que esta fase no
-- agrega dominio y por lo tanto no hay política `tenant_isolation` que
-- escribir a mano.
--
-- Las capacidades tienen que coincidir EXACTAMENTE con `SYSTEM_ROLES`:
-- `tests/unit/seed-roles.test.ts` es el compilador que le falta al SQL y falla
-- si acá se cuela una capacidad de más, de menos o mal escrita.

insert into "role" ("id", "organization_id", "key", "name", "capabilities", "system")
select
  'rol_' || substr(md5(o."id" || ':' || 'administracion'), 1, 20),
  o."id",
  'administracion',
  'Administración',
  '["cobranza.ver","inscripciones.ver","academico.ver","contactos.ver"]'::jsonb,
  true
from "organization" o
on conflict ("organization_id", "key") do nothing;
