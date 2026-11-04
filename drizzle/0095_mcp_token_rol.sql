-- 0095 — Tokens del MCP ligados a un ROL (un token por perfil).
--
-- `mcp_token.role_id`: con valor, el token usa las capacidades de ESE rol (y
-- nada más); `null` = token de persona, como hasta ahora, así que los ya
-- emitidos siguen funcionando igual. Borrar el rol borra sus tokens (cascada):
-- el token deja de servir y nunca cae a algo más amplio.
--
-- La tabla ya tiene `tenant_isolation` (0094): esta migración no la toca.
--
-- RE-EJECUTABLE (constitución IV): `if not exists` en la columna; la FK dentro
-- de un `do $$` contra `pg_constraint`.

alter table "mcp_token" add column if not exists "role_id" text;--> statement-breakpoint

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'mcp_token_role_id_role_id_fk') then
    alter table "mcp_token"
      add constraint "mcp_token_role_id_role_id_fk"
      foreign key ("role_id") references public."role"("id") on delete cascade on update no action;
  end if;
end $$;
