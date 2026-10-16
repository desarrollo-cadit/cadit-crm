-- 2026-10-16 — 038 Certificados en PDF con el diseño de la academia.
--
--   `certificate.snapshot` (FR-004)
--     Lo que el PDF dice, congelado al emitir (alumno, curso, año, formato,
--     módulo, lista de módulos, descripción). Las filas existentes quedan en
--     NULL y se arman con los datos de hoy al descargarse. `certificate` ya
--     tiene RLS (`tenant_isolation`): una columna nueva no cambia la política.
--
--   `course.certificate_description` (FR-012)
--     El párrafo opcional del certificado de un curso o un módulo. NULL en
--     todos los cursos existentes: el certificado sale sin párrafo.
--
--   Los módulos otorgan certificado (FR-014)
--     Los cursos de tipo 'modulo' con `grants_certificate = false` se
--     encienden (el default de 032 era un error: en producción eran 4). Los de
--     tipo 'curso' y 'taller' NO se tocan: un curso común apagado a propósito
--     sigue apagado.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en las columnas; el
-- UPDATE es idempotente (la segunda corrida no encuentra filas en false).

alter table "certificate" add column if not exists "snapshot" jsonb;--> statement-breakpoint
alter table "course" add column if not exists "certificate_description" text;--> statement-breakpoint
update "course" set "grants_certificate" = true, "updated_at" = now()
  where "kind" = 'modulo' and "grants_certificate" = false;
