import { and, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { corteDeBorrado } from "@/lib/recording-purge";
import { detachMissing, purgeMissing, restoreReappeared } from "./assignment";
import { inOrgScope } from "./scope";

/**
 * Las grabaciones que ya no están en Zoom, por conexión. Lo corren la
 * sincronización incremental y la verificación diaria, siempre FUERA de toda
 * transacción larga: una consulta corta para saber a quiénes, y cada
 * grabación en su propia transacción (`assignment.ts`).
 *
 * Es por ESTADO, no por evento: lo que hay que hacer se lee de la base. Por
 * eso es idempotente y también arregla lo que quedó de antes (grabaciones ya
 * marcadas como faltantes que seguían enlazadas a su clase).
 */

const t = schema.zoomRecording;

/** Ids que cumplen la condición, en una transacción corta. */
function ids(orgId: string, connectionId: string, ...cond: Parameters<typeof and>) {
  return inOrgScope(orgId, async () =>
    (
      await getDb()
        .select({ id: t.id })
        .from(t)
        .where(scoped(t.organizationId, orgId, eq(t.zoomConnectionId, connectionId), and(...cond)))
    ).map((r) => r.id)
  );
}

/**
 * Faltantes que todavía tienen clase → se sueltan. Reaparecidas que se
 * habían soltado → se restauran (manual) o se olvidan (automática: el
 * matcher ya las evaluó en la página que las trajo).
 */
export async function reconcileMissing(
  orgId: string,
  connectionId: string
): Promise<{ detached: number; restored: number }> {
  let detached = 0;
  let restored = 0;
  for (const id of await ids(orgId, connectionId, isNotNull(t.missingInZoomAt), isNotNull(t.classSessionId))) {
    if (await detachMissing(orgId, id)) detached++;
  }
  for (const id of await ids(orgId, connectionId, isNull(t.missingInZoomAt), isNotNull(t.missingFromClassSessionId))) {
    if ((await restoreReappeared(orgId, id)) === "restaurada") restored++;
  }
  return { detached, restored };
}

/** Borra las que faltan hace `purgeDays` días o más. Devuelve cuántas. */
export async function purgeMissingOfConnection(orgId: string, connectionId: string, purgeDays: number): Promise<number> {
  const corte = corteDeBorrado(new Date(), purgeDays);
  let borradas = 0;
  for (const id of await ids(orgId, connectionId, isNotNull(t.missingInZoomAt), lt(t.missingInZoomAt, corte))) {
    if (await purgeMissing(orgId, id, { purgeDays })) borradas++;
  }
  return borradas;
}
