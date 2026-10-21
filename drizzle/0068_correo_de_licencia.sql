-- 2026-10-21 — Correo para la licencia + correos de contacto en minúsculas.
--
--   1. `enrollment.license_email`: la licencia de una inscripción puede ir a
--      otro correo que el del alumno. NULL = el del contacto
--      (`correoDeLicencia()`, src/lib/license-email.ts). Sin backfill.
--
--   2. `contact.email` en minúsculas y recortado. La app ya escribe así en
--      toda alta y edición; esto alinea lo que había. Un correo que tiene un
--      "gemelo" en la misma organización que solo difiere en mayúsculas NO
--      se toca: pasarlo a minúsculas rompería `contact_org_email_uq`, y
--      fusionar personas no es trabajo de una migración. Se listan con:
--        select organization_id, lower(trim(email)), count(*) from contact
--        where email is not null group by 1, 2 having count(*) > 1;
--
--   3. `contact_org_email_lower_uq` (organization_id, lower(email)): cierra
--      la carrera de dos altas simultáneas con el mismo correo escrito
--      distinto. Se crea SOLO si no quedan gemelos; si los hay, la migración
--      sigue igual (el chequeo previo de la app ya compara sin mayúsculas).
--
-- RE-EJECUTABLE (constitución IV): `add column if not exists`; el UPDATE solo
-- toca filas que todavía no están normalizadas; el índice va con
-- `if not exists` dentro de un `do $$`. RLS no cambia (columna nueva en una
-- tabla que ya tiene `tenant_isolation`).

alter table "enrollment" add column if not exists "license_email" text;--> statement-breakpoint

update "contact" c
set "email" = lower(trim(c."email"))
where c."email" is not null
  and c."email" <> lower(trim(c."email"))
  and not exists (
    select 1 from "contact" o
    where o."organization_id" = c."organization_id"
      and o."id" <> c."id"
      and o."email" is not null
      and lower(trim(o."email")) = lower(trim(c."email"))
  );--> statement-breakpoint

do $$
begin
  if not exists (
    select 1 from "contact"
    where "email" is not null
    group by "organization_id", lower("email")
    having count(*) > 1
  ) then
    create unique index if not exists "contact_org_email_lower_uq"
      on "contact" using btree ("organization_id", lower("email"))
      where "email" is not null;
  end if;
end $$;
