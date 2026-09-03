import { sql } from "drizzle-orm";
import { getRootDb } from "./index";
import { runWithTenantScope } from "./tenant-context";

/**
 * 012 (T024, DV-002 opción A) — Corre el pedido dentro de una transacción que
 * declara su organización y su actor.
 *
 * ```sql
 * SET LOCAL app.current_org   = '<organizationId>';
 * SET LOCAL app.current_actor = '<userId>';
 * ```
 *
 * **`LOCAL` es la palabra que sostiene toda la fase.** Limita el valor a la
 * transacción: al terminar, la conexión vuelve limpia al pool. Sin `LOCAL` el
 * valor queda pegado a la CONEXIÓN, y el pedido siguiente que la tome hereda
 * la organización del anterior — una fuga entre inquilinos que aparecería solo
 * bajo concurrencia, en producción, y sin dejar rastro. Está verificado en
 * `scripts/verify-rls.mjs`: después del commit la misma conexión ve cero filas.
 *
 * Se usa `set_config(..., true)` y no `SET LOCAL` literal porque acepta un
 * parámetro: `SET LOCAL` solo admite literales, así que armarlo por
 * concatenación abriría una inyección de SQL en el borde de autenticación.
 *
 * `app.current_actor` todavía no lo lee ninguna política; se declara ahora
 * porque es el dato que va a necesitar la auditoría, y porque agregarlo
 * después obligaría a tocar de nuevo este borde.
 */
export function withTenantTransaction<T>(
  scope: { organizationId: string; userId: string },
  fn: () => Promise<T>
): Promise<T> {
  return withOrganizationScope(scope.organizationId, scope.userId, fn);
}

/**
 * 012 (T028) — La misma transacción, para lo que NO tiene sesión de staff.
 *
 * Hay cuatro puertas legítimas que entran sin `withAuth` y que igual escriben
 * o leen datos de una organización. Antes de RLS no necesitaban decir de quién
 * eran los datos; ahora sí, o no ven nada:
 *
 *   * el catálogo y los formularios públicos (`/api/public/*`), que resuelven
 *     la organización única de la instancia,
 *   * el webhook de Meta, que la resuelve por su token secreto,
 *   * `/api/bot/*`, que la resuelve por su API key,
 *   * el alta de la primera organización, que la está creando.
 *
 * `actor` no es un `user.id` en estos casos —no hay persona detrás— sino una
 * etiqueta del sistema (`system:webhook`). Se guarda igual porque el día que
 * haya auditoría, "lo hizo el webhook" es exactamente el dato que se va a
 * querer leer.
 */
export async function withOrganizationScope<T>(
  organizationId: string,
  actor: string,
  fn: () => Promise<T>
): Promise<T> {
  const afterCommit: (() => void)[] = [];

  const result = await getRootDb().transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('app.current_org', ${organizationId}, true)`
    );
    await tx.execute(sql`select set_config('app.current_actor', ${actor}, true)`);
    return runWithTenantScope(
      { tx, organizationId, actorId: actor, afterCommit },
      fn
    );
  });

  /**
   * 012 (T028) — Recién ACÁ la transacción confirmó, así que recién acá las
   * filas que se acaban de crear son visibles para cualquier otra conexión.
   *
   * Va después del `await` y no dentro del callback a propósito: adentro, el
   * commit todavía no ocurrió y la tarea vería exactamente lo mismo que no
   * veía antes. Y si el bloque LANZA, esto no corre — que es lo correcto: no
   * hay nada que hacer sobre un trabajo que se revirtió.
   *
   * Cada tarea se aísla: una que falle no puede impedir las demás ni tumbar
   * el pedido, que a esta altura ya respondió.
   */
  for (const task of afterCommit) {
    try {
      task();
    } catch (err) {
      console.error("[tenant] tarea post-commit falló:", err);
    }
  }

  return result;
}
