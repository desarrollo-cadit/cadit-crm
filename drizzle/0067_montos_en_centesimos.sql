-- 2026-10-21 — Montos con centésimos (DV-008 revisada).
--
--   Hasta 0066 todo importe era un `integer` en unidades ENTERAS ($ 5.000 =
--   5000). La academia cobra montos con centésimos ($ 5.245,32), así que todo
--   importe pasa a `bigint` en CENTÉSIMOS (unidades menores), con la MISMA
--   escala ×100 para todas las monedas (UYU, USD y PYG):
--
--     teacher.hourly_rate · course.list_price · cohort.cost ·
--     enrollment.amount · workshop_registration.amount ·
--     installment.amount · payment.amount
--
--   Los datos existentes se multiplican por 100 al cambiar el tipo
--   ($ 5.000 → 500000). El cast a bigint va ANTES de multiplicar: un integer
--   grande × 100 desbordaría.
--
-- RE-EJECUTABLE (constitución IV): el TIPO de la columna es la marca. Cada
-- columna se convierte solo si `information_schema.columns.data_type` sigue
-- siendo 'integer'; una columna que ya es bigint no se toca, así que volver a
-- correr esto nunca multiplica dos veces. Todo va en UN solo bloque `do $$`:
-- o cambian las siete columnas o ninguna.
--
-- No hay CHECKs, índices ni vistas sobre estas columnas (verificado contra
-- 0000–0066): el cambio de tipo no arrastra nada más. RLS no se toca (las
-- políticas filtran por `organization_id`).
--
-- `tests/unit/migracion-centesimos.test.ts` exige el guard por tipo en cada
-- columna.

do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'teacher'
               and column_name = 'hourly_rate' and data_type = 'integer') then
    alter table "teacher" alter column "hourly_rate" type bigint using "hourly_rate"::bigint * 100;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'course'
               and column_name = 'list_price' and data_type = 'integer') then
    alter table "course" alter column "list_price" type bigint using "list_price"::bigint * 100;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'cohort'
               and column_name = 'cost' and data_type = 'integer') then
    alter table "cohort" alter column "cost" type bigint using "cost"::bigint * 100;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'enrollment'
               and column_name = 'amount' and data_type = 'integer') then
    alter table "enrollment" alter column "amount" type bigint using "amount"::bigint * 100;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'workshop_registration'
               and column_name = 'amount' and data_type = 'integer') then
    alter table "workshop_registration" alter column "amount" type bigint using "amount"::bigint * 100;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'installment'
               and column_name = 'amount' and data_type = 'integer') then
    alter table "installment" alter column "amount" type bigint using "amount"::bigint * 100;
  end if;

  if exists (select 1 from information_schema.columns
             where table_schema = current_schema() and table_name = 'payment'
               and column_name = 'amount' and data_type = 'integer') then
    alter table "payment" alter column "amount" type bigint using "amount"::bigint * 100;
  end if;
end $$;
