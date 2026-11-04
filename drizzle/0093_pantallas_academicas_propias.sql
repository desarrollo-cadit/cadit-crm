-- 2026-11-04 — Decisión del dueño: Administración no ve Licencias, Cursos
-- offline ni Talleres.
--
--   `licencias.ver`, `cursosoffline.ver` y `talleres.ver` son capacidades nuevas.
--   Las pantallas que hasta hoy pedían `academico.ver` pasan a pedir la suya, y
--   Administración conserva `academico.ver` (la necesita para leer la cobranza).
--
-- Cada rol que ya tenía `academico.ver` recibe las tres, así que nadie pierde
-- nada, EXCEPTO el rol de sistema `administracion` (por llave), que no las
-- recibe. Los roles creados a mano (`system = false`) con `academico.ver` también
-- las reciben, para no sacarle una pantalla a quien hoy la usa: si alguno es de
-- facturación, la dueña se las quita desde `/settings/roles`.
--
-- Solo SUMA y respeta lo que la dueña haya editado: si a un rol le sacó
-- `academico.ver`, no recibe nada.
--
-- RE-EJECUTABLE (constitución IV): `not (… @> …)`.

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('licencias.ver'),
    "updated_at" = now()
where "key" = 'direccion'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('licencias.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cursosoffline.ver'),
    "updated_at" = now()
where "key" = 'direccion'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('cursosoffline.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('talleres.ver'),
    "updated_at" = now()
where "key" = 'direccion'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('talleres.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('licencias.ver'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('licencias.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cursosoffline.ver'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('cursosoffline.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('talleres.ver'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('talleres.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('licencias.ver'),
    "updated_at" = now()
where "key" = 'soporte'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('licencias.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cursosoffline.ver'),
    "updated_at" = now()
where "key" = 'soporte'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('cursosoffline.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('talleres.ver'),
    "updated_at" = now()
where "key" = 'soporte'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('talleres.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('licencias.ver'),
    "updated_at" = now()
where "key" = 'ventas'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('licencias.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cursosoffline.ver'),
    "updated_at" = now()
where "key" = 'ventas'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('cursosoffline.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('talleres.ver'),
    "updated_at" = now()
where "key" = 'ventas'
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('talleres.ver'));--> statement-breakpoint

-- Los roles creados a mano van AL FINAL y sin llave a propósito:
-- `seed-roles.test.ts` empareja cada `update` con la llave de su `where`.
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('licencias.ver'),
    "updated_at" = now()
where "system" = false
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('licencias.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('cursosoffline.ver'),
    "updated_at" = now()
where "system" = false
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('cursosoffline.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('talleres.ver'),
    "updated_at" = now()
where "system" = false
  and "capabilities" @> jsonb_build_array('academico.ver')
  and not ("capabilities" @> jsonb_build_array('talleres.ver'));
