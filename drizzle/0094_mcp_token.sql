-- 0092 — Tokens de acceso del MCP remoto (`/api/mcp`).
--
-- Una tabla de dominio (con `organization_id`): `mcp_token`. Cada token es una
-- persona del equipo (`user_id`) y NO guarda capacidades: se resuelven al
-- usarlo desde su rol. El token en claro no se guarda nunca, solo su hash
-- SHA-256 y los últimos cuatro caracteres.
--
-- Sin backfill: nace vacía y el MCP queda cerrado hasta que alguien con
-- `accesos.gestionar` emita un token.
--
-- RLS: nace con `tenant_isolation` (`db:generate` no genera políticas;
-- `tests/unit/rls-cobertura.test.ts`). La verificación del token NO es una
-- excepción a RLS: resuelve la organización única de la instancia y busca el
-- hash dentro de su alcance, igual que `/api/bot/*`.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en tabla e índices; las FKs
-- dentro de un `do $$` contra `pg_constraint`; política con `drop ... if exists`.

create table if not exists "mcp_token" (
	"id" text primary key not null,
	"organization_id" text not null,
	"user_id" text not null,
	"name" text not null,
	"token_hash" text not null,
	"last4" text not null,
	"created_at" timestamp default now() not null,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);--> statement-breakpoint

do $$
declare
  f record;
begin
  for f in
    select * from (values
      ('mcp_token', 'mcp_token_organization_id_organization_id_fk', 'organization_id', 'organization', 'cascade'),
      ('mcp_token', 'mcp_token_user_id_user_id_fk', 'user_id', 'user', 'cascade')
    ) as t(tabla, nombre, columna, referida, accion)
  loop
    if not exists (select 1 from pg_constraint where conname = f.nombre) then
      execute format(
        'alter table %I add constraint %I foreign key (%I) references public.%I("id") on delete %s on update no action',
        f.tabla, f.nombre, f.columna, f.referida, f.accion
      );
    end if;
  end loop;
end $$;--> statement-breakpoint

create unique index if not exists "mcp_token_org_hash_uq" on "mcp_token" using btree ("organization_id","token_hash");--> statement-breakpoint
create index if not exists "mcp_token_org_user_idx" on "mcp_token" using btree ("organization_id","user_id");--> statement-breakpoint

-- RLS, la parte que `db:generate` NO escribe.
alter table "mcp_token" enable row level security;--> statement-breakpoint
drop policy if exists tenant_isolation on "mcp_token";--> statement-breakpoint
create policy tenant_isolation on "mcp_token"
  using (organization_id = current_setting('app.current_org', true))
  with check (organization_id = current_setting('app.current_org', true));
