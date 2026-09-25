-- 028 (seguimiento) — La especialización pasa a ser una MARCA explícita.
--
-- Una columna y un relleno. Ninguna tabla, ningún índice.
--
-- Hasta acá una cohorte era especialización recién cuando tenía módulos
-- colgando, y cualquier cohorte raíz servía de madre. Decisión del dueño: la
-- condición se persiste, y el servidor exige la marca para poder colgarle
-- módulos (`src/server/program-modules.ts`).
--
-- RELLENO: toda cohorte que YA tiene módulos queda marcada. Sin esto, las
-- EBIM armadas antes de esta migración perderían la pestaña de la
-- especialización el día del deploy, y además quedarían en un estado que la
-- regla nueva prohíbe (una madre que no es especialización).
--
-- RLS: `cohort` ya tiene su política `tenant_isolation` desde el ciclo 012 y
-- una columna nueva no necesita ninguna. `tests/unit/rls-cobertura.test.ts`
-- lo verifica.
--
-- RE-EJECUTABLE (constitución IV): `add column if not exists`, y el relleno
-- sólo pone `true` donde hay hijos — correrlo dos veces deja lo mismo.

alter table "cohort" add column if not exists "is_specialization" boolean default false not null;
--> statement-breakpoint
update "cohort" set "is_specialization" = true
where "is_specialization" = false
  and exists (select 1 from "cohort" "c2" where "c2"."parent_cohort_id" = "cohort"."id");
