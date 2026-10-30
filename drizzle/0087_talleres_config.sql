-- 0087 — Configuración de los grupos de curso taller: ¿tiene evaluaciones? ¿emite certificado?
-- Default true: ningún grupo existente cambia de comportamiento. Re-ejecutable.
alter table "cohort" add column if not exists "has_assessments" boolean default true not null;--> statement-breakpoint
alter table "cohort" add column if not exists "issues_certificate" boolean default true not null;
