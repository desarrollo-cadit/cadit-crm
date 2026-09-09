import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
import { currentTenantTx } from "./tenant-context";
import * as schema from "./schema";

/**
 * Cliente de BD único por proceso. En dev, Next recarga módulos: se cachea en
 * globalThis para no agotar conexiones.
 */
const globalForDb = globalThis as unknown as {
  __voceroSql?: ReturnType<typeof postgres>;
};

function createClient() {
  const env = getEnv();
  return postgres(env.DATABASE_URL, {
    max: 10,
    onnotice: () => {},
  });
}

export function getSql() {
  if (!globalForDb.__voceroSql) globalForDb.__voceroSql = createClient();
  return globalForDb.__voceroSql;
}

let cachedDb: ReturnType<typeof drizzle<typeof schema>> | null = null;

/**
 * El cliente de siempre, SIN mirar el contexto del pedido.
 *
 * Lo usan dos cosas: el envoltorio que abre la transacción del pedido (que
 * necesita el cliente raíz para abrirla, no la transacción en curso) y el
 * trabajo de fondo que corre fuera de todo pedido.
 */
export function getRootDb() {
  if (!cachedDb) cachedDb = drizzle(getSql(), { schema });
  return cachedDb;
}

/**
 * 012 (T024) — La conexión que corresponde: la transacción del pedido si hay
 * una abierta, o el cliente raíz si no.
 *
 * Esta indirección es lo que hace que RLS funcione sin reescribir el dominio.
 * Todo el código que ya llamaba `getDb()` —decenas de módulos— pasa a correr
 * dentro de la transacción que declaró `app.current_org`, sin cambiar una
 * línea. Y lo que corre fuera de un pedido (agente, Laboratorio) sigue usando
 * el cliente raíz, como antes.
 */
export function getDb() {
  const tx = currentTenantTx();
  // El cast es inevitable: la transacción de drizzle y el cliente exponen la
  // misma superficie de consulta pero no comparten un tipo común nombrable.
  if (tx) return tx as ReturnType<typeof drizzle<typeof schema>>;
  return getRootDb();
}

/**
 * Conexión de base: el cliente normal o una transacción abierta. Las funciones
 * que escriben la aceptan para poder componerse dentro de una transacción del
 * llamador (p. ej. guardar curso y temario de una sola vez). Vive acá y no en
 * un módulo de dominio para que dos dominios que se componen no tengan que
 * importarse entre sí solo por el tipo.
 */
export type DbOrTx =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export { schema };
