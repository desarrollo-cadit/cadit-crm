-- 2026-10-26 — Correo secundario del contacto (laboral / personal).
--
--   `contact.secondary_email`  minúsculas y recortado (lo normaliza la API,
--                              como el principal). Se busca y se chequea
--                              contra duplicados; NUNCA es un destino.
--   `contact_org_secondary_email_uq`  red de seguridad ante una carrera y
--                              llave de búsqueda del chequeo de duplicados.
--
-- Sin tablas nuevas: la columna vive en `contact`, que ya tiene RLS
-- (`tenant_isolation`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists`.

alter table "contact" add column if not exists "secondary_email" text;--> statement-breakpoint
create unique index if not exists "contact_org_secondary_email_uq" on "contact" using btree ("organization_id","secondary_email") where "contact"."secondary_email" is not null;
