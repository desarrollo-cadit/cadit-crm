import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { getEnv } from "@/lib/env";
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

export function getDb() {
  if (!cachedDb) cachedDb = drizzle(getSql(), { schema });
  return cachedDb;
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
