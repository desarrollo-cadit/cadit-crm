-- 2026-10-09 — 030 Grabaciones de Zoom, addendum (prueba en vivo del dueño).
--
--   `virtual_room.zoom_synced_through`
--     La marca de agua pasa a ser POR AULA (research R-12). Con la marca por
--     conexión, una corrida sin aulas vinculadas "terminaba bien" y adelantaba
--     la fecha a hoy: las aulas vinculadas después solo miraban los 3 días de
--     solape y nunca traían sus 90 días. NULL = el aula todavía no trajo su
--     respaldo: la próxima corrida lo pide entero. Las aulas que ya existen
--     quedan en NULL A PROPÓSITO: así recuperan lo que la marca vieja les saltó.
--
--   `virtual_room.zoom_user_pmi`
--     La sala personal (PMI) del usuario de Zoom vinculado, como la informó
--     Zoom. Solo sirve para AVISAR si el enlace del aula es otro; el enlace no
--     se reescribe sin que alguien lo pida.
--
--   `zoom_recording.file_types`
--     Los tipos de archivo de la reunión (`MP4`, `TRANSCRIPT`, `CC`…): solo
--     metadatos de `recording_files`. El CRM no descarga ni guarda video.
--
-- Sin tablas nuevas: RLS no cambia (las dos tablas ya tienen `tenant_isolation`).
-- RE-EJECUTABLE (constitución IV): `if not exists` en las tres columnas.

alter table "virtual_room" add column if not exists "zoom_user_pmi" text;--> statement-breakpoint
alter table "virtual_room" add column if not exists "zoom_synced_through" date;--> statement-breakpoint
alter table "zoom_recording" add column if not exists "file_types" text[] default '{}'::text[] not null;
