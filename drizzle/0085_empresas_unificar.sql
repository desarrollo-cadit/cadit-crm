-- 2026-10-29 — Decisión del dueño: unificar empresas duplicadas.
--
--   `empresas.unificar`  a los roles de sistema `direccion`, `coordinacion`
--                        y `soporte`, por llave: los mismos que recibieron
--                        `contactos.unificar` (0078). `ventas` y
--                        `administracion` NO la reciben. Unificar borra la
--                        empresa absorbida: es irreversible.
--
-- Solo SUMA: no le quita nada a ningún rol, y respeta lo que el dueño haya
-- editado en `/settings/roles`.
--
-- RE-EJECUTABLE (constitución IV): `where not (… @> …)`.

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('empresas.unificar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('empresas.unificar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('empresas.unificar'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('empresas.unificar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('empresas.unificar'),
    "updated_at" = now()
where "key" = 'soporte'
  and not ("capabilities" @> jsonb_build_array('empresas.unificar'));
