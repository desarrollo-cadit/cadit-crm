-- 2026-10-26 — Decisión del dueño: unificar contactos duplicados.
--
--   `contactos.unificar`  a los roles de sistema `direccion`, `coordinacion`
--                         y `soporte`, por llave. `ventas` y
--                         `administracion` NO la reciben. Unificar borra al
--                         contacto absorbido: es irreversible.
--
-- Solo SUMA: no le quita nada a ningún rol, y respeta lo que el dueño haya
-- editado en `/settings/roles`.
--
-- RE-EJECUTABLE (constitución IV): `where not (… @> …)`.

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('contactos.unificar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('contactos.unificar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('contactos.unificar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('contactos.unificar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('contactos.unificar'),
    "updated_at" = now()
where "key" = 'soporte'
  and not ("capabilities" @> jsonb_build_array('contactos.unificar'));
