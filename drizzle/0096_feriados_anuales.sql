-- 0096 — Feriados que se repiten todos los años (recesos de un solo día).
--
-- `recess.recurring`: con `true`, el receso es UN día cuyo mes y día valen cada
-- año, desde el año de `from_date` en adelante (un 29/02 cae el 28/02 en los
-- años no bisiestos). Los recesos de antes quedan en `false`: siguen siendo el
-- rango de esas fechas, sin cambios. Un rango nunca es anual.
--
-- La tabla ya tiene `tenant_isolation`: esta migración no la toca.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en la columna; el CHECK
-- dentro de un `do $$` contra `pg_constraint`.

alter table "recess" add column if not exists "recurring" boolean default false not null;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recess_anual_un_dia') then
    alter table "recess"
      add constraint "recess_anual_un_dia"
      check ((not "recurring") or "from_date" = "to_date");
  end if;
end $$;
