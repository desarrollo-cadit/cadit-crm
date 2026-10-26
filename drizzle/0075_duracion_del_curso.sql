-- 2026-10-26 — Duración del curso en clases y horas.
--
--   `course.class_count`      Cantidad de clases (entero).
--   `course.hours_per_class`  Horas por clase, numeric(4,2): 2, 2,5, 4.
--   `course.total_hours`      Duración total en horas, numeric(7,2). Es lo que
--                             dice el certificado. Se GUARDA (no se deriva):
--                             un examen o una última clase más corta lo pueden
--                             hacer distinto de clases × horas por clase.
--
-- Relleno: `total_hours = duration_weeks * hours_per_week` donde las dos están
-- cargadas, para que los certificados ya emitidos sigan diciendo las mismas
-- horas. `class_count` y `hours_per_class` quedan vacías: "semanas" no es
-- "clases", e inventarlas sería peor que dejarlas para cargar.
--
-- `duration_weeks` / `hours_per_week` NO se borran en esta migración: quedan
-- una versión por seguridad (y el catálogo público las sigue devolviendo,
-- solo lectura, hasta que la web migre). Se borran en una migración posterior.
--
-- Sin tablas nuevas: las columnas viven en `course`, que ya tiene RLS.
--
-- RE-EJECUTABLE (constitución IV): `add column if not exists`; el relleno solo
-- toca filas con `total_hours` vacío, así que nunca pisa un total cargado.

alter table "course" add column if not exists "class_count" integer;--> statement-breakpoint
alter table "course" add column if not exists "hours_per_class" numeric(4, 2);--> statement-breakpoint
alter table "course" add column if not exists "total_hours" numeric(7, 2);--> statement-breakpoint

update "course"
set "total_hours" = "duration_weeks" * "hours_per_week"
where "total_hours" is null
  and "duration_weeks" is not null
  and "hours_per_week" is not null;
