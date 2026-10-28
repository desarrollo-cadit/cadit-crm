-- 043 — ¿A quién le vence el acceso al desplegar? SOLO LECTURA.
--
-- Al desplegar 043, quien terminó una cohorte hace más de un mes deja de ver
-- sus grabaciones, material, avisos, enlaces de clase y los cursos offline que
-- le llegaron por esa cohorte. No hay período de gracia silencioso. Esto lista
-- a quién le pasa a una fecha dada, para mirarlo ANTES de desplegar.
--
-- Uso (no escribe nada en ninguna tabla: arma vistas TEMPORALES de la sesión
-- dentro de una transacción que termina en ROLLBACK):
--
--   psql "$OWNER_DATABASE_URL" -v fecha=2026-10-20 -f scripts/accesos-que-vencen.sql
--
-- Conectarse con el dueño de las tablas (p. ej. `postgres`): con `cadit_app`
-- y sin `app.current_org` la RLS devuelve cero filas y el resumen da todo 0.
--
-- `fecha` es el día (en la zona de la academia) en que se mira: el acceso está
-- vencido ese día si su último día con acceso es ANTERIOR a esa fecha.
--
-- Misma regla que `src/lib/access-expiry.ts`:
--   - referencia de una cohorte = delivery_deadline (0083, la entrega final);
--     sin ella, end_date; sin ella, la última clase no cancelada; sin
--     ninguna, no vence.
--   - especialización (madre con módulos): el ÚLTIMO módulo (y la end_date de
--     la madre si es posterior); si algún módulo no tiene fecha, no vence.
--   - hasta = referencia + 1 mes calendario (Postgres recorta fin de mes:
--     31/01 + 1 mes = 28/02).
--   - las hijas (módulos) heredan el de su madre.
--   - 0083: las prórrogas APROBADAS (`assessment_extension`) de la inscripción
--     y sus hijas, en evaluaciones de su grupo, estiran `hasta` hasta su día
--     (en la zona de la academia), sin sumarle otro mes. Requiere la 0083.
-- Antes de desplegar nadie tiene fecha fijada a mano (`access_until` llega con
-- la 0064), así que la consulta no la lee: funciona antes y después.

\if :{?fecha}
\else
  \echo 'Falta la fecha: psql ... -v fecha=AAAA-MM-DD -f scripts/accesos-que-vencen.sql'
  \quit
\endif

-- No es `read only`: Postgres no deja crear ni vistas temporales en una
-- transacción de solo lectura. Las vistas son temporales y el ROLLBACK final
-- las descarta; ninguna sentencia toca una tabla.
begin;

create temporary view _ref_cohorte as
select c.id, c.organization_id, c.parent_cohort_id, c.is_specialization,
       coalesce(c.name, co.name) as nombre,
       coalesce(
         c.delivery_deadline::date,
         c.end_date::date,
         (select max(s.date)::date from class_session s
           where s.cohort_id = c.id and s.canceled_at is null)
       ) as referencia
from cohort c
left join course co on co.id = c.course_id;

create temporary view _raiz as
select e.id as enrollment_id, e.organization_id, e.contact_id, e.cohort_id,
       r.nombre as cohorte, r.referencia as ref_propia, r.is_specialization
from enrollment e
join _ref_cohorte r on r.id = e.cohort_id
where e.parent_enrollment_id is null;

-- Los módulos de cada recorrido: los del programa + las cohortes de las hijas.
create temporary view _modulos as
select ra.enrollment_id, m.id as cohort_id, m.referencia
from _raiz ra
join _ref_cohorte m on m.parent_cohort_id = ra.cohort_id
union
select ra.enrollment_id, h.cohort_id, m.referencia
from _raiz ra
join enrollment h on h.parent_enrollment_id = ra.enrollment_id and h.cohort_id is not null
join _ref_cohorte m on m.id = h.cohort_id;

create temporary view _acceso as
select ra.*,
       case
         when not exists (select 1 from _modulos mo where mo.enrollment_id = ra.enrollment_id)
           then ra.ref_propia
         when exists (select 1 from _modulos mo where mo.enrollment_id = ra.enrollment_id and mo.referencia is null)
           then null
         else greatest(ra.ref_propia,
                       (select max(mo.referencia) from _modulos mo where mo.enrollment_id = ra.enrollment_id))
       end as referencia
from _raiz ra;

-- 0083 — La prórroga aprobada más tardía de cada recorrido (día de la academia).
create temporary view _prorroga as
select ra.enrollment_id,
       max((ae.due_at at time zone 'UTC' at time zone o.timezone)::date) as dia
from _raiz ra
join organization o on o.id = ra.organization_id
join enrollment e on e.id = ra.enrollment_id or e.parent_enrollment_id = ra.enrollment_id
join assessment_extension ae on ae.enrollment_id = e.id
join assessment asm on asm.id = ae.assessment_id and asm.cohort_id = e.cohort_id
group by ra.enrollment_id;

create temporary view _hasta as
select a.*,
       case when a.referencia is null then null
            else greatest((a.referencia + interval '1 month')::date, p.dia)
       end as hasta
from _acceso a
left join _prorroga p on p.enrollment_id = a.enrollment_id;

create temporary view _estado as
select h.*, (h.hasta is not null and h.hasta < :'fecha'::date) as vencido
from _hasta h;

\echo
\echo '== Resumen a la fecha indicada =='
select count(distinct contact_id) filter (where vencido) as personas_que_pierden_acceso,
       count(*) filter (where vencido)                    as cursadas_vencidas,
       count(distinct cohort_id) filter (where vencido)   as cohortes_vencidas,
       count(*) filter (where referencia is null)          as cursadas_sin_fecha_no_vencen
from _estado;

\echo
\echo '== Cohortes con alumnos que pierden el acceso =='
select cohorte, referencia as termino, hasta as acceso_hasta, count(*) as alumnos
from _estado
where vencido
group by cohorte, referencia, hasta
order by hasta desc, cohorte;

\echo
\echo '== Cohortes sin fecha de fin ni clases (su acceso NO vence) =='
select distinct cohorte
from _estado
where referencia is null
order by cohorte;

\echo
\echo '== Detalle: quién pierde el acceso =='
select coalesce(ct.first_name || ' ' || ct.last_name, ct.first_name) as persona,
       ct.email, es.cohorte, es.hasta as acceso_hasta
from _estado es
join contact ct on ct.id = es.contact_id
where es.vencido
order by es.cohorte, persona;

rollback;
