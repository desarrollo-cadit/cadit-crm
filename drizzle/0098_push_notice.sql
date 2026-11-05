-- 0098 — Avisos push ya reclamados (idempotencia de los disparadores).
--
-- `dedup_key` es única por organización: un reinicio o una segunda pasada
-- jamás repite un aviso, porque la llave se reclama ANTES de mandar. Un push es
-- "a lo sumo una vez": no se reintenta.
--
-- Sin backfill: nace vacía.
--
-- RLS: nace con `tenant_isolation` (`db:generate` no genera políticas;
-- `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índices; las FKs
-- dentro de un `do $$` contra `pg_constraint`; política con `drop ... if exists`.

create table if not exists "push_notice" (
	"id" text primary key not null,
	"organization_id" text not null,
	"kind" text not null,
	"contact_id" text not null,
	"dedup_key" text not null,
	"status" text not null,
	"created_at" timestamp default now() not null
);--> statement-breakpoint

do $$
declare
  f record;
begin
  for f in
    select * from (values
      ('push_notice', 'push_notice_organization_id_organization_id_fk', 'organization_id', 'organization'),
      ('push_notice', 'push_notice_contact_id_contact_id_fk', 'contact_id', 'contact')
    ) as t(tabla, nombre, columna, referida)
  loop
    if not exists (select 1 from pg_constraint where conname = f.nombre) then
      execute format(
        'alter table %I add constraint %I foreign key (%I) references public.%I("id") on delete cascade on update no action',
        f.tabla, f.nombre, f.columna, f.referida
      );
    end if;
  end loop;
end $$;--> statement-breakpoint

create unique index if not exists "push_notice_org_dedup_uq" on "push_notice" using btree ("organization_id","dedup_key");--> statement-breakpoint
create index if not exists "push_notice_org_created_idx" on "push_notice" using btree ("organization_id","created_at");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "push_notice" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "push_notice";--> statement-breakpoint
create policy tenant_isolation on "push_notice"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
