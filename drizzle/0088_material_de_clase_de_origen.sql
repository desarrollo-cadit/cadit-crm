-- 2026-10-30 — Clonar grupo: el material de las CLASES del grupo original.
--
-- El grupo nuevo nace sin clases (el cronograma se genera al confirmarlo), así
-- que el material que colgaba de una clase se copia como material del GRUPO
-- que RECUERDA de qué clase venía: su número (para sugerir la clase del mismo
-- número) y una etiqueta legible ("Clase 3 · 12/03 · Muros"). Al asignarlo a
-- una clase del grupo nuevo, las dos columnas vuelven a NULL.
--
-- `resource` ya tiene RLS (`tenant_isolation`): sumar columnas no la toca.
--
-- RE-EJECUTABLE (constitución IV): `add column if not exists`.

alter table "resource" add column if not exists "origin_class_number" integer;--> statement-breakpoint
alter table "resource" add column if not exists "origin_class_label" text;
