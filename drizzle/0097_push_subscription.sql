-- 0097 — Suscripciones de Web Push del portal (una fila por dispositivo).
--
-- `endpoint` es único: un navegador es una suscripción. Las claves del
-- dispositivo (p256dh + auth) se guardan CIFRADAS (cipher/iv/tag, AES-256-GCM
-- de `lib/crypto`): con ellas se le puede escribir a ese celular.
--
-- Sin backfill: nace vacía; nadie recibe nada hasta que activa los avisos.
--
-- RLS: nace con `tenant_isolation` (`db:generate` no genera políticas;
-- `tests/unit/rls-cobertura.test.ts`).
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índices; las FKs
-- dentro de un `do $$` contra `pg_constraint`; política con `drop ... if exists`.

create table if not exists "push_subscription" (
	"id" text primary key not null,
	"organization_id" text not null,
	"user_id" text not null,
	"contact_id" text,
	"endpoint" text not null,
	"keys_cipher" text not null,
	"keys_iv" text not null,
	"keys_tag" text not null,
	"user_agent" text,
	"created_at" timestamp default now() not null,
	"last_seen_at" timestamp default now() not null,
	"disabled_at" timestamp
);--> statement-breakpoint

do $$
declare
  f record;
begin
  for f in
    select * from (values
      ('push_subscription', 'push_subscription_organization_id_organization_id_fk', 'organization_id', 'organization'),
      ('push_subscription', 'push_subscription_user_id_user_id_fk', 'user_id', 'user'),
      ('push_subscription', 'push_subscription_contact_id_contact_id_fk', 'contact_id', 'contact')
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

create unique index if not exists "push_subscription_endpoint_uq" on "push_subscription" using btree ("endpoint");--> statement-breakpoint
create index if not exists "push_subscription_org_user_idx" on "push_subscription" using btree ("organization_id","user_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "push_subscription" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "push_subscription";--> statement-breakpoint
create policy tenant_isolation on "push_subscription"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
