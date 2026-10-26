-- 2026-10-26 — Decisión del dueño: asignar y quitar licencias es de Soporte.
--
--   `licencias.gestionar`  a los roles de sistema `direccion` y `soporte`,
--                          por llave. `coordinacion` NO la recibe: sigue
--                          viendo las licencias, pero ya no las cambia
--                          (las rutas pasan de `academico.editar` a esta).
--
-- Solo SUMA: no le quita nada a ningún rol, y respeta lo que el dueño haya
-- editado en `/settings/roles` (si a soporte le sacó algo, sigue sacado).
--
-- RE-EJECUTABLE (constitución IV): `where not (… @> …)`.

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('licencias.gestionar'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('licencias.gestionar'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('licencias.gestionar'),
    "updated_at" = now()
where "key" = 'soporte'
  and not ("capabilities" @> jsonb_build_array('licencias.gestionar'));
