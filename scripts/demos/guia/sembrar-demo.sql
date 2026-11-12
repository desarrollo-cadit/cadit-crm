-- Datos de apoyo para dos videos de la guía que no se pueden producir sin
-- buzón de marketing ni WhatsApp conectado: una campaña ya enviada con sus
-- resultados y unas conversaciones de la Bandeja. Todo ficticio.
-- Solo corre contra cadit_demo. Re-ejecutable (on conflict do nothing).
--
--   PGCLIENTENCODING=UTF8 psql -v ON_ERROR_STOP=1 -h localhost -p 5433 -U postgres -d cadit_demo -f scripts/demos/guia/sembrar-demo.sql

begin;

do $$ begin
  if current_database() <> 'cadit_demo' then raise exception 'solo cadit_demo'; end if;
end $$;

insert into marketing_campaign (id, organization_id, name, subject, body, status, recipient_count, sender_email, sender_name, send_confirmed_at, finished_at, created_at, updated_at)
select 'mc_demo_enviada', o.id, 'Novedades de noviembre', 'Nuevos grupos que comienzan en diciembre',
  -- Forma que lee `leerCuerpo` (src/server/marketing/campaigns.ts): { v: 1, blocks: [...] }.
  '{"v":1,"blocks":[{"type":"heading","level":1,"text":"Nuevos grupos de diciembre"},{"type":"paragraph","text":"Hola {{nombre}}, abrimos inscripciones para los grupos que comienzan en diciembre."}]}'::jsonb,
  'enviada', 40, 'novedades@demo.test', 'CAD IT Solution Provider',
  now() - interval '3 days', now() - interval '3 days' + interval '25 minutes', now() - interval '4 days', now() - interval '3 days'
from organization o limit 1
on conflict (id) do nothing;

insert into marketing_campaign_recipient (id, organization_id, campaign_id, contact_id, email, first_name, last_name, vars, position, status, reason, attempted_at, sent_at, unsubscribed_at)
select 'mcr_demo_' || c.n, c.organization_id, 'mc_demo_enviada', c.id, c.email, coalesce(c.first_name, 'Contacto'), c.last_name, '{}'::jsonb, c.n,
  case when c.n = 7 then 'omitido' when c.n in (15, 31) then 'fallido' else 'enviado' end,
  case when c.n = 7 then 'baja' when c.n in (15, 31) then 'Buzón del destinatario no disponible' end,
  now() - interval '3 days',
  case when c.n not in (7, 15, 31) then now() - interval '3 days' + (c.n || ' minutes')::interval end,
  case when c.n = 22 then now() - interval '2 days' end
from (
  select (row_number() over (order by id))::int n, id, organization_id, email, first_name, last_name
  from contact where email like '%@demo.test' and archived_at is null limit 40
) c
on conflict (id) do nothing;


insert into marketing_campaign_link (id, organization_id, campaign_id, position, url)
select 'mcl_demo_1', organization_id, 'mc_demo_enviada', 1, 'https://example.com/grupos-diciembre'
from marketing_campaign where id = 'mc_demo_enviada'
on conflict (id) do nothing;

insert into marketing_click (id, organization_id, campaign_id, recipient_id, link_id, clicked_at)
select 'mck_demo_' || position, organization_id, 'mc_demo_enviada', id, 'mcl_demo_1', now() - interval '3 days' + (position * 7 || ' minutes')::interval
from marketing_campaign_recipient
where campaign_id = 'mc_demo_enviada' and status = 'enviado' and position in (2, 4, 9, 12, 18, 21, 25, 30, 36)
on conflict (id) do nothing;

create temp table _c as
  select (row_number() over (order by id))::int n, id, organization_id
  from contact where phone is not null and archived_at is null and email like '%@demo.test' limit 4;

insert into conversation (id, organization_id, contact_id, is_test, ai_enabled, last_inbound_at, last_message_at, unread_count, created_at, updated_at)
select 'cv_demo_' || n, organization_id, id, false, n <> 2,
  now() - (n || ' hours')::interval, now() - (n || ' hours')::interval, case when n < 3 then n else 0 end, now() - interval '2 days', now()
from _c
on conflict (id) do nothing;

insert into message (id, organization_id, conversation_id, wa_message_id, direction, type, text, status, ai_generated, wa_timestamp, created_at, origin)
select 'msg_demo_' || c.n || '_' || k, c.organization_id, 'cv_demo_' || c.n, 'wamid.demo' || c.n || k,
  case when k % 2 = 1 then 'in' else 'out' end, 'text',
  (array['Hola, quisiera información sobre el curso de AutoCAD.',
         'Hola, con gusto. Comienza el 2 de diciembre, los martes y jueves de 18:30 a 20:30. ¿Le envío el programa?',
         'Sí, por favor. ¿Cuál es el valor?'])[k],
  case when k % 2 = 1 then 'received' else 'delivered' end, false,
  now() - (c.n || ' hours')::interval + (k || ' minutes')::interval,
  now() - (c.n || ' hours')::interval + (k || ' minutes')::interval,
  case when k % 2 = 1 then 'contact' else 'agent' end
from _c c, generate_series(1, 3) k
on conflict (id) do nothing;

commit;
