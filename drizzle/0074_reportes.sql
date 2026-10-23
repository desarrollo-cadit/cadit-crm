-- 2026-10-23 — 046 US8: reportes del inicio.
--
--   `course.is_free`               "Gratuito: no cuenta como venta" (FR-029)
--   `company.exclude_from_reports` "Excluir de los reportes" (FR-030)
--   `reportes.ver`                 a los roles de sistema `direccion` y
--                                  `coordinacion`, por llave (FR-026). Los
--                                  demás roles no la reciben.
--
-- Sin tablas nuevas: las dos columnas viven en tablas que ya tienen RLS.
--
-- RE-EJECUTABLE (constitución IV): `add column if not exists`; capacidades
-- con `where not (… @> …)`.

alter table "course" add column if not exists "is_free" boolean default false not null;--> statement-breakpoint
alter table "company" add column if not exists "exclude_from_reports" boolean default false not null;--> statement-breakpoint

update "role"
set "capabilities" = "capabilities" || jsonb_build_array('reportes.ver'),
    "updated_at" = now()
where "key" = 'direccion'
  and not ("capabilities" @> jsonb_build_array('reportes.ver'));--> statement-breakpoint
update "role"
set "capabilities" = "capabilities" || jsonb_build_array('reportes.ver'),
    "updated_at" = now()
where "key" = 'coordinacion'
  and not ("capabilities" @> jsonb_build_array('reportes.ver'));
