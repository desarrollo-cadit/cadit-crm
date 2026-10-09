import { hostname } from "node:os";
import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb } from "@/lib/db";
import { inOrgScope } from "./scope";

/**
 * 030 (DV-004) — "Una sincronización por organización a la vez", con un lease
 * persistido en `zoom_sync_state`.
 *
 * Tomar el lease es UN `UPDATE … WHERE lease_until IS NULL OR lease_until <
 * now() RETURNING` en una transacción corta: con dos procesos (rolling deploy)
 * el segundo espera el lock de la fila, re-evalúa el WHERE y no devuelve
 * nada. El lease vence solo si el proceso muere; mientras la corrida avanza
 * se renueva por aula. A diferencia de un advisory lock de sesión, no retiene
 * una conexión del pool durante minutos de HTTP y se puede mostrar en la UI
 * ("corriendo desde las 10:42").
 */

export const LEASE_MS = 15 * 60_000;

export interface LeaseStore {
  acquire(
    orgId: string,
    owner: string,
    until: Date
  ): Promise<{ ok: true; startedAt: Date } | { ok: false; startedAt: Date | null }>;
  renew(orgId: string, owner: string, until: Date): Promise<void>;
  release(orgId: string, owner: string): Promise<void>;
}

/** `<hostname>:<pid>:<nanoid>` — quién corre, para diagnosticar un lease colgado. */
export function leaseOwner(): string {
  return `${hostname()}:${process.pid}:${nanoid(8)}`;
}

type Row = { started: Date | string | null };
const asDate = (v: Date | string | null) => (v === null ? null : new Date(v));

export const dbLeaseStore: LeaseStore = {
  acquire(orgId, owner, until) {
    return inOrgScope(orgId, async () => {
      const db = getDb();
      await db.execute(
        sql`insert into zoom_sync_state (organization_id) values (${orgId}) on conflict (organization_id) do nothing`
      );
      const tomado = (await db.execute(sql`
        update zoom_sync_state
           set lease_owner = ${owner},
               lease_until = ${until.toISOString()}::timestamptz at time zone 'UTC',
               current_run_started_at = now() at time zone 'UTC',
               updated_at = now()
         where organization_id = ${orgId}
           and (lease_until is null or lease_until < now() at time zone 'UTC')
        returning current_run_started_at as started
      `)) as unknown as Row[];
      if (tomado.length > 0) return { ok: true as const, startedAt: asDate(tomado[0]!.started)! };

      const actual = (await db.execute(
        sql`select current_run_started_at as started from zoom_sync_state where organization_id = ${orgId}`
      )) as unknown as Row[];
      return { ok: false as const, startedAt: asDate(actual[0]?.started ?? null) };
    });
  },
  renew(orgId, owner, until) {
    return inOrgScope(orgId, async () => {
      await getDb().execute(sql`
        update zoom_sync_state
           set lease_until = ${until.toISOString()}::timestamptz at time zone 'UTC', updated_at = now()
         where organization_id = ${orgId} and lease_owner = ${owner}
      `);
    });
  },
  release(orgId, owner) {
    return inOrgScope(orgId, async () => {
      await getDb().execute(sql`
        update zoom_sync_state
           set lease_owner = null, lease_until = null, current_run_started_at = null, updated_at = now()
         where organization_id = ${orgId} and lease_owner = ${owner}
      `);
    });
  },
};

/** "Corriendo desde…": el lease vigente de la organización, o `null`. */
export async function currentRun(orgId: string): Promise<{ startedAt: Date } | null> {
  const rows = (await getDb().execute(sql`
    select current_run_started_at as started
      from zoom_sync_state
     where organization_id = ${orgId}
       and lease_until is not null
       and lease_until >= now() at time zone 'UTC'
  `)) as unknown as Row[];
  const started = asDate(rows[0]?.started ?? null);
  return started ? { startedAt: started } : null;
}
