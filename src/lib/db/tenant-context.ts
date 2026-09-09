import { AsyncLocalStorage } from "node:async_hooks";

/**
 * 012 (T024) — La transacción del pedido en curso, accesible sin pasarla de
 * mano en mano.
 *
 * El problema: para que RLS filtre, TODA consulta del pedido tiene que correr
 * dentro de la transacción que declaró `app.current_org`. Pero `getDb()` se
 * llama desde decenas de módulos de dominio que no saben nada de pedidos.
 * Pasar la transacción por parámetro hasta cada uno significaría tocar toda la
 * base de código y, peor, dejar abierta la posibilidad de olvidarse en una —
 * que es exactamente el olvido que esta fase vino a hacer imposible.
 *
 * `AsyncLocalStorage` resuelve eso: el contexto viaja con la cadena de
 * `await`, así que `getDb()` puede preguntar "¿estoy dentro de un pedido?" sin
 * que nadie se lo diga.
 *
 * **Este módulo no importa nada del resto de la app a propósito.** `db/index`
 * lo consulta, así que cualquier import de vuelta cerraría el círculo.
 */

/** Se guarda como `unknown` para no depender del tipo de drizzle desde acá. */
type TenantScope = {
  tx: unknown;
  organizationId: string;
  actorId: string;
  /** Tareas a ejecutar una vez que la transacción CONFIRMÓ (ver `onAfterCommit`). */
  afterCommit: (() => void)[];
};

// En globalThis: en desarrollo Next reevalúa los módulos y dos copias del
// AsyncLocalStorage serían dos contextos que no se ven entre sí.
const globalForTenant = globalThis as unknown as {
  __caditTenantScope?: AsyncLocalStorage<TenantScope>;
};

function storage(): AsyncLocalStorage<TenantScope> {
  if (!globalForTenant.__caditTenantScope) {
    globalForTenant.__caditTenantScope = new AsyncLocalStorage<TenantScope>();
  }
  return globalForTenant.__caditTenantScope;
}

/** La transacción del pedido en curso, o `undefined` fuera de un pedido. */
export function currentTenantTx(): unknown | undefined {
  return storage().getStore()?.tx;
}

/** La organización declarada en el pedido en curso. Útil para diagnóstico. */
export function currentTenantScope(): TenantScope | undefined {
  return storage().getStore();
}

export function runWithTenantScope<T>(
  scope: TenantScope,
  fn: () => Promise<T>
): Promise<T> {
  return storage().run(scope, fn);
}

/**
 * 012 (T028) — Agenda una tarea para DESPUÉS de que la transacción confirme.
 *
 * El problema que resuelve, encontrado corriendo el arnés contra `cadit_app`:
 * el webhook inserta un `media_asset` y dispara la descarga con un
 * fire-and-forget. Esa tarea abre su propia transacción y —en aislamiento
 * read-committed— **no puede ver la fila que la transacción del webhook
 * todavía no confirmó**. Encontraba nada, salía sin hacer ruido, y el adjunto
 * quedaba en `pending` para siempre. `fetch_error` en NULL fue la prueba: ni
 * siquiera había intentado la descarga.
 *
 * La regla que deja: **una tarea suelta no ve las filas que acaba de crear la
 * transacción que la disparó.** Reintentar o esperar un rato taparía el
 * problema hasta que reaparezca bajo carga; esperar el commit lo resuelve.
 *
 * Fuera de un alcance (trabajo de fondo, scripts) se ejecuta al instante: no
 * hay commit que esperar.
 */
export function onAfterCommit(task: () => void): void {
  const scope = storage().getStore();
  if (!scope) {
    task();
    return;
  }
  scope.afterCommit.push(task);
}
