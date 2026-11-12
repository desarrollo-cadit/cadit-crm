-- Los teléfonos ficticios usan el prefijo 598 55…, que no existe para celulares ni fijos reales:
-- así nunca coinciden con el de una persona de verdad.
--
-- Anonimiza el CLON de producción que se usa para grabar la guía en video.
--
-- Corre SOLO contra `cadit_demo` (copia de `cadit_copia`). Se niega a correr en
-- cualquier otra base. Conserva la estructura, los cursos, los grupos, los
-- roles, la marca y las cantidades; reemplaza personas, empresas, contactos,
-- conversaciones, enlaces de reunión y todo secreto.
--
--   psql -v ON_ERROR_STOP=1 -h localhost -p 5433 -U postgres -d cadit_demo -f scripts/demos/guia/anonimizar.sql

begin;

do $$
begin
  if current_database() <> 'cadit_demo' then
    raise exception 'anonimizar.sql solo corre contra cadit_demo (base actual: %)', current_database();
  end if;
end $$;

create function pg_temp.pn(n bigint) returns text language sql immutable as $$
  select (array['Martina','Santiago','Valentina','Joaquín','Camila','Facundo','Lucía','Mateo','Sofía','Nicolás',
    'Julieta','Agustín','Emilia','Bruno','Renata','Tomás','Abril','Lautaro','Florencia','Ignacio',
    'Antonella','Bautista','Milagros','Felipe','Catalina','Gonzalo','Victoria','Maximiliano','Paula','Sebastián',
    'Candela','Federico','Josefina','Ramiro','Micaela','Diego','Natalia','Andrés','Carolina','Martín',
    'Romina','Pablo','Daniela','Rodrigo','Gabriela','Esteban','Mariana','Leandro'])[1 + (n % 48)::int]
$$;

create function pg_temp.ap(n bigint) returns text language sql immutable as $$
  select (array['Rodríguez','Pereira','Silva','González','Martínez','Suárez','Fernández','López','Díaz','Pérez',
    'Sosa','Álvarez','Romero','Torres','Ramos','Acosta','Benítez','Méndez','Cabrera','Rivero',
    'Castro','Ferreira','Gómez','Olivera','Techera','Vázquez','Núñez','Correa','Morales','Cardozo',
    'Machado','Rocha','Giménez','Delgado','Ibarra','Peralta','Viera','Maidana','Pintos','Lemos',
    'Bentancor','Altuna','Barrios','Cáceres','Duarte','Esteves','Fagúndez','Guerra','Hernández','Iglesias',
    'Leites','Montero'])[1 + ((n * 5 + n / 48) % 52)::int]
$$;

create function pg_temp.sa(t text) returns text language sql immutable as $$
  select lower(translate(t, 'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU'))
$$;

create function pg_temp.empresa(n bigint) returns text language sql immutable as $$
  select (array['Constructora','Estudio','Ingeniería','Arquitectura','Consultora','Grupo','Inmobiliaria','Servicios','Proyectos','Desarrollos'])[1 + ((n - 1) % 10)::int]
    || ' ' ||
    (array['Aurora','Delta','Horizonte','Norte','Sur','Andes','Plata','Costa','Cerro','Río','Faro','Roble','Cedro','Alba','Nova','Orión','Piedra','Sol'])[1 + (((n - 1) / 10) % 18)::int]
$$;

/* ---------------------------------------------------------------- personas */

-- Paso intermedio: los números falsos tienen la misma forma que los reales y
-- chocarían con los que todavía no se reemplazaron (índice único).
update contact set wa_identity = 'tmp:' || id
  where wa_identity not like 'sinwa:%' and wa_identity not like 'bsuid:%';
update teacher set wa_identity = 'tmp:' || id where wa_identity is not null;

create temp table _contactos as select id, row_number() over (order by id) n from contact;

update contact c set
  first_name = pg_temp.pn(k.n),
  last_name = pg_temp.ap(k.n),
  email = case when c.email is not null then pg_temp.sa(pg_temp.pn(k.n) || '.' || pg_temp.ap(k.n)) || k.n || '@demo.test' end,
  secondary_email = case when c.secondary_email is not null then 'trabajo' || k.n || '@demo.test' end,
  phone = case when c.phone is not null then '59855' || lpad(((k.n * 7919) % 1000000)::text, 6, '0') end,
  wa_identity = case
    when c.wa_identity like 'bsuid:%' then 'bsuid:demo' || k.n
    when c.wa_identity like 'sinwa:%' then c.wa_identity
    else '59855' || lpad(((k.n * 7919) % 1000000)::text, 6, '0') end,
  wa_user_id = null,
  national_id = case when c.national_id is not null then (4000000 + k.n)::text end,
  notes = null
from _contactos k where c.id = k.id;

create temp table _profesores as select id, row_number() over (order by id) n from teacher;
update teacher t set
  name = pg_temp.pn(k.n + 5000) || ' ' || pg_temp.ap(k.n + 5000),
  email = case when t.email is not null then pg_temp.sa(pg_temp.pn(k.n + 5000) || '.' || pg_temp.ap(k.n + 5000)) || '.prof' || k.n || '@demo.test' end,
  wa_identity = case when t.wa_identity is not null then '59855' || lpad(((k.n * 104729) % 1000000)::text, 6, '0') end,
  photo_mime_type = null
from _profesores k where t.id = k.id;

create temp table _vendedores as select id, row_number() over (order by id) n from seller;
update seller s set
  name = pg_temp.pn(k.n + 9000) || ' ' || pg_temp.ap(k.n + 9000),
  email = case when s.email is not null then pg_temp.sa(pg_temp.pn(k.n + 9000)) || '.ventas' || k.n || '@demo.test' end
from _vendedores k where s.id = k.id;

/* --------------------------------------------------------------- empresas */

create temp table _empresas as select id, row_number() over (order by id) n from company;
update company c set
  legal_name = pg_temp.empresa(k.n) || ' S.A.',
  trade_name = case when c.trade_name is not null then pg_temp.empresa(k.n) end,
  tax_id = case when c.tax_id is not null then '21' || lpad(k.n::text, 10, '0') end,
  address_street = case when c.address_street is not null then 'Calle Ejemplo ' || (100 + k.n) end,
  billing_contact_name = case when c.billing_contact_name is not null then pg_temp.pn(k.n + 3000) || ' ' || pg_temp.ap(k.n + 3000) end,
  billing_email = case when c.billing_email is not null then 'facturacion' || k.n || '@empresa' || k.n || '.demo.test' end,
  billing_phone = case when c.billing_phone is not null then '59855' || lpad(((k.n * 7919) % 1000000)::text, 6, '0') end,
  notes = null
from _empresas k where c.id = k.id;

/* ------------------------------------------------------------ cuentas */

create temp table _usuarios as select id, row_number() over (order by id) n from "user";
update "user" u set
  name = pg_temp.pn(k.n + 7000) || ' ' || pg_temp.ap(k.n + 7000),
  email = 'usuario' || k.n || '@demo.test',
  image = null
from _usuarios k where u.id = k.id;

-- Quien es alumno o profesor lleva el nombre y el correo de su persona.
update "user" u set
  name = c.first_name || ' ' || c.last_name,
  email = coalesce(c.email, u.email)
from account_link l join contact c on c.id = l.contact_id
where l.user_id = u.id and l.contact_id is not null;

update "user" u set
  name = t.name,
  email = coalesce(t.email, u.email)
from account_link l join teacher t on t.id = l.teacher_id
where l.user_id = u.id and l.teacher_id is not null;

update seller s set name = u.name from "user" u where s.user_id = u.id;

update account set access_token = null, refresh_token = null, id_token = null;
delete from session;
delete from verification;
delete from invitation;
delete from push_subscription;
delete from mcp_token;

update activity_log set ip_address = '203.0.113.10';

/* ------------------------------------------------------- conversaciones */

update message set media_asset_id = null;
delete from media_asset;
update message set text = case
  when text is null then null
  when direction ilike 'in%' then (array[
    'Hola, quisiera información sobre el curso.',
    'Buenas tardes, ¿cuándo empieza el próximo grupo?',
    '¿Cuál es el valor y qué medios de pago aceptan?',
    'Gracias, ya realicé el pago.',
    '¿Me pueden enviar el enlace de la clase?',
    'Perfecto, quedo atento.'])[1 + (abs(hashtext(id)) % 6)]
  else (array[
    'Hola, gracias por escribirnos. Con gusto le cuento los detalles.',
    'El próximo grupo comienza el mes que viene. ¿Le envío el programa?',
    'Aceptamos transferencia y tarjeta. Le paso los datos.',
    'Recibimos su pago, muchas gracias.',
    'Aquí está el enlace de la clase.',
    'Quedamos a las órdenes.'])[1 + (abs(hashtext(id)) % 6)] end;
update conversation set handoff_reason = null;
delete from area_handoff;

update contact_activity set body = 'Nota de seguimiento de ejemplo.';
create temp table _formularios as select id, row_number() over (order by id) n from contact_form_submission;
update contact_form_submission s set
  first_name = pg_temp.pn(k.n + 100), last_name = pg_temp.ap(k.n + 100),
  email = case when s.email is not null then 'interesado' || k.n || '@demo.test' end,
  phone = case when s.phone is not null then '59855' || lpad(((k.n * 7919) % 1000000)::text, 6, '0') end,
  message = case when s.message is not null then 'Consulta de ejemplo sobre el curso.' end,
  company = case when s.company is not null then 'Empresa de ejemplo' end
from _formularios k where s.id = k.id;

/* ------------------------------------------- avisos, marketing, licencias */

delete from staff_notice;
delete from assessment_notice;
delete from push_notice;
update bulk_send_recipient set message = null;

update area_config set
  mailbox = case when mailbox is not null then area || '@demo.test' end,
  cc_emails = case when cc_emails is not null then '{}'::text[] end;
update marketing_settings set
  sender_email = 'marketing@demo.test',
  footer_address = 'Calle Ejemplo 123, Montevideo, Uruguay',
  footer_contact = 'info@demo.test';
update marketing_campaign set sender_email = case when sender_email is not null then 'marketing@demo.test' end;
update marketing_campaign_recipient r set
  email = coalesce(c.email, 'destino' || abs(hashtext(r.id)) || '@demo.test'),
  first_name = c.first_name, last_name = c.last_name, vars = '{}'
from contact c where r.contact_id = c.id;
update marketing_unsubscribe u set email = coalesce(c.email, 'baja' || abs(hashtext(u.id)) || '@demo.test')
from contact c where u.contact_id = c.id;
update marketing_unsubscribe set email = 'baja' || abs(hashtext(id)) || '@demo.test' where contact_id is null;

create temp table _matriculas as select id, row_number() over (order by id) n from enrollment;
update enrollment e set license_email = 'licencia' || k.n || '@demo.test'
from _matriculas k where e.id = k.id and e.license_email is not null;
update license_email_alias set email = 'alias' || abs(hashtext(id)) || '@demo.test';
update license_autodesk_task set email = 'licencia' || abs(hashtext(id)) || '@demo.test', subject = 'Pendiente en Autodesk', person_name = case when person_name is not null then 'Persona de ejemplo' end;
update license_case_resolution set note = null, subject = 'persona' || abs(hashtext(id)) || '@demo.test';
create temp table _importadas as select id, row_number() over (order by id) n from license_import_row;
update license_import_row r set
  email = 'licencia' || k.n || '@demo.test',
  first_name = pg_temp.pn(k.n + 200), last_name = pg_temp.ap(k.n + 200)
from _importadas k where r.id = k.id;

/* --------------------------------------------------------- Zoom y Meta */

update zoom_connection set account_id = 'demo-account-' || abs(hashtext(id)), client_id = 'demo-client-' || abs(hashtext(id)), client_secret_last4 = '0000';
update meta_credentials set waba_id = 'demo-waba', phone_number_id = 'demo-phone', display_phone_number = '+598 99 000 000';
update virtual_room set
  url = case when url is not null then 'https://zoom.us/j/8' || lpad((abs(hashtext(id)) % 10000000000)::text, 10, '0') end,
  account_email = case when account_email is not null then 'zoom' || abs(hashtext(id)) || '@demo.test' end,
  zoom_user_email = case when zoom_user_email is not null then 'zoom' || abs(hashtext(id)) || '@demo.test' end,
  notes = null;
update zoom_recording set
  host_email = case when host_email is not null then 'zoom@demo.test' end,
  topic = case when topic is not null then 'Clase grabada' end,
  share_url = case when share_url is not null then 'https://zoom.us/rec/share/demo' || abs(hashtext(id)) end,
  play_url = case when play_url is not null then 'https://zoom.us/rec/play/demo' || abs(hashtext(id)) end;
update zoom_participant_segment set display_name = 'Participante ' || (abs(hashtext(id)) % 1000),
  email = case when email is not null then 'participante' || abs(hashtext(id)) || '@demo.test' end;
update class_session set
  meeting_url = case when meeting_url is not null then 'https://zoom.us/j/8' || lpad((abs(hashtext(id)) % 10000000000)::text, 10, '0') end,
  recording_url = case when recording_url is not null then 'https://zoom.us/rec/share/demo' || abs(hashtext(id)) end;
update cohort set meeting_url = case when meeting_url is not null then 'https://zoom.us/j/8' || lpad((abs(hashtext(id)) % 10000000000)::text, 10, '0') end;

/* --------------------------------------------- textos libres y entregas */

update resource set url = case when url is not null then 'https://example.com/material/' || id end;
update submission set url = case when url is not null then 'https://example.com/entrega/' || id end,
  title = case when title is not null then 'Entrega' end, feedback = null;
update assessment_result set notes = null;
update attendance set notes = null;
update enrollment_final_result set note = null;
update historical_course_taking set note = null;
update installment set notes = null;
update payment set notes = null;
update offline_course_grant set note = null;

commit;
