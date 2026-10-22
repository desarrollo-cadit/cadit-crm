import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, getRootDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { inOrgScope } from "./scope";
import { runSync } from "./sync";
import { runVerify, verifyDue } from "./verify";

/**
 * 030 US5 (DV-004) — La sincronización periódica, in-process.
 *
 * La constitución no admite colas ni cron externos, así que el servidor se
 * despierta solo. Lo que sostiene el diseño:
 *
 *  - **Quién está vencido lo decide la BASE**, no la memoria del proceso:
 *    una organización se sincroniza si alguna conexión activa con aulas
 *    vinculadas tiene `last_sync_at` más viejo que el intervalo. Por eso un
 *    reinicio no "pierde" la cuenta, y un servidor apagado tres días se pone
 *    al día en la primera pasada (la ventana sale de la marca de cada aula).
 *  - **Una corrida por organización, aun con dos procesos o con el botón**:
 *    el tick llama a `runSync`, que toma el lease de `zoom_sync_state` o se
 *    va con `sync_en_curso`. El temporizador no agrega ningún candado propio
 *    salvo no solapar sus propios ticks.
 *  - **Nunca lanza** y nunca corre dentro de un pedido: cada escritura abre su
 *    propio alcance corto (`inOrgScope`), como la corrida del botón.
 *  - **`ZOOM_SYNC_INTERVAL_MIN=0` la apaga** (default), y no arranca nunca en
 *    los tests ni durante `next build`.
 *  - Los temporizadores van con `unref()`: no retienen el proceso al apagarse.
 *  - **La verificación diaria** (grabaciones borradas de Zoom, `verify.ts`)
 *    corre en el mismo tick, después de las sincronizaciones, una vez por
 *    día y organización según `zoom_connection.last_verify_at`. Solo existe
 *    con la periódica encendida.
 */

export type SchedulerDeps = {
  intervalMin: number;
  /** Espera antes de la primera pasada (la base puede estar migrando). */
  bootDelayMs: number;
  dueOrganizations: (intervalMin: number) => Promise<string[]>;
  runOrg: (orgId: string) => Promise<unknown>;
  /**
   * Verificación diaria (`verify.ts`): las organizaciones con alguna conexión
   * cuya última verificación tiene un día o más (`last_verify_at`, en la
   * base: un reinicio no la repite). Corre después de las sincronizaciones
   * del tick, con el mismo lease.
   */
  dueVerifyOrganizations?: () => Promise<string[]>;
  verifyOrg?: (orgId: string) => Promise<unknown>;
  log: (msg: string) => void;
};

const MIN = 60_000;
/** Un tick que llega unos segundos antes de tiempo igual cuenta. */
const SLACK_MS = 30_000;

/** Cada cuánto se mira la base: min(intervalo, 5 min). */
export function tickEveryMs(intervalMin: number): number {
  return Math.min(intervalMin, 5) * MIN;
}

/**
 * Solo en el servidor Node de verdad: ni en vitest ni en `next build`.
 *
 * El runtime lo garantiza quien llama (`instrumentation.ts`, donde Next
 * reemplaza `process.env.NEXT_RUNTIME` al compilar). El objeto `process.env`
 * del servidor standalone NO trae `NEXT_RUNTIME`: exigirlo acá dejaba la
 * periódica apagada en producción sin ningún log. Solo se rechaza un runtime
 * declarado distinto de Node.
 */
export function shouldStartScheduler(env: Record<string, string | undefined>): boolean {
  if (env.NEXT_RUNTIME && env.NEXT_RUNTIME !== "nodejs") return false;
  if (env.VITEST || env.NODE_ENV === "test") return false;
  if (env.NEXT_PHASE === "phase-production-build") return false;
  return true;
}

type State = { timeout: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> };

// En globalThis: en desarrollo Next reevalúa los módulos y dos copias del
// módulo serían dos temporizadores.
const globalForScheduler = globalThis as unknown as { __caditZoomScheduler?: State | null };

/** Resumen del resultado, sin nada que no sea un código propio. */
function describir(result: unknown): string {
  if (result && typeof result === "object" && "ok" in result) {
    const r = result as { ok: boolean; error?: string };
    return r.ok ? "corrida terminada" : (r.error ?? "sin corrida");
  }
  return "sin resultado";
}

/**
 * Arranca el temporizador. Devuelve `true` si lo arrancó; `false` si está
 * apagado o ya estaba corriendo (idempotente).
 */
export function startZoomScheduler(deps: SchedulerDeps = defaultSchedulerDeps()): boolean {
  if (!(deps.intervalMin > 0)) return false;
  if (globalForScheduler.__caditZoomScheduler) return false;

  /** La verificación diaria: nunca lanza ni frena a la sincronización. */
  const verificar = async () => {
    if (!deps.dueVerifyOrganizations || !deps.verifyOrg) return;
    let orgs: string[];
    try {
      orgs = await deps.dueVerifyOrganizations();
    } catch (err) {
      deps.log(`[zoom-sync] verificación: no se pudo leer qué verificar (${err instanceof Error ? err.name : "error"})`);
      return;
    }
    for (const orgId of orgs) {
      try {
        const r = await deps.verifyOrg(orgId);
        deps.log(`[zoom-sync] verificación: ${orgId} → ${describir(r)}`);
      } catch (err) {
        deps.log(`[zoom-sync] verificación: ${orgId} falló (${err instanceof Error ? err.name : "error"})`);
      }
    }
  };

  let busy = false;
  const tick = async () => {
    // Una corrida larga no se solapa con el tick siguiente del mismo proceso.
    if (busy) return;
    busy = true;
    try {
      let orgs: string[] = [];
      try {
        orgs = await deps.dueOrganizations(deps.intervalMin);
      } catch (err) {
        deps.log(`[zoom-sync] periódica: no se pudo leer qué sincronizar (${err instanceof Error ? err.name : "error"})`);
      }
      for (const orgId of orgs) {
        try {
          const r = await deps.runOrg(orgId);
          deps.log(`[zoom-sync] periódica: ${orgId} → ${describir(r)}`);
        } catch (err) {
          deps.log(`[zoom-sync] periódica: ${orgId} falló (${err instanceof Error ? err.name : "error"})`);
        }
      }
      await verificar();
    } finally {
      busy = false;
    }
  };

  const timeout = setTimeout(() => void tick(), deps.bootDelayMs);
  timeout.unref?.();
  const interval = setInterval(() => void tick(), tickEveryMs(deps.intervalMin));
  interval.unref?.();
  globalForScheduler.__caditZoomScheduler = { timeout, interval };
  deps.log(`[zoom-sync] periódica encendida: cada ${deps.intervalMin} min`);
  return true;
}

export function stopZoomScheduler(): void {
  const s = globalForScheduler.__caditZoomScheduler;
  if (!s) return;
  clearTimeout(s.timeout);
  clearInterval(s.interval);
  globalForScheduler.__caditZoomScheduler = null;
}

/* ============================================================
 * Implementación sobre la base
 * ============================================================ */

/**
 * Las organizaciones con alguna conexión activa, con aulas activas
 * vinculadas, cuya última sincronización es más vieja que el intervalo (o
 * nunca corrió). `organization` no tiene RLS (no es tabla de dominio); la
 * consulta de conexiones corre en el alcance de cada organización.
 */
export async function dueOrganizationsFromDb(intervalMin: number, now = new Date()): Promise<string[]> {
  const orgs = await getRootDb().select({ id: schema.organization.id }).from(schema.organization);
  const cutoff = new Date(now.getTime() - intervalMin * MIN + SLACK_MS);
  const c = schema.zoomConnection;
  const v = schema.virtualRoom;
  const vencidas: string[] = [];
  for (const { id } of orgs) {
    const filas = await inOrgScope(id, () =>
      getDb()
        .select({ id: c.id })
        .from(c)
        .where(
          scoped(
            c.organizationId,
            id,
            isNull(c.archivedAt),
            or(isNull(c.lastSyncAt), lt(c.lastSyncAt, cutoff)),
            sql`exists (${getDb()
              .select({ x: sql`1` })
              .from(v)
              .where(
                and(
                  eq(v.organizationId, id),
                  eq(v.zoomConnectionId, c.id),
                  isNull(v.archivedAt),
                  isNotNull(v.zoomUserId)
                )
              )})`
          )
        )
        .limit(1)
    );
    if (filas.length > 0) vencidas.push(id);
  }
  return vencidas;
}

/**
 * Las organizaciones con alguna conexión activa con aulas vinculadas a la que
 * le toca la verificación diaria (`verifyDue` sobre `last_verify_at`).
 */
export async function dueVerifyOrganizationsFromDb(now = new Date()): Promise<string[]> {
  const orgs = await getRootDb().select({ id: schema.organization.id }).from(schema.organization);
  const c = schema.zoomConnection;
  const v = schema.virtualRoom;
  const vencidas: string[] = [];
  for (const { id } of orgs) {
    const filas = await inOrgScope(id, () =>
      getDb()
        .select({ lastVerifyAt: c.lastVerifyAt })
        .from(c)
        .where(
          scoped(
            c.organizationId,
            id,
            isNull(c.archivedAt),
            sql`exists (${getDb()
              .select({ x: sql`1` })
              .from(v)
              .where(
                and(
                  eq(v.organizationId, id),
                  eq(v.zoomConnectionId, c.id),
                  isNull(v.archivedAt),
                  isNotNull(v.zoomUserId)
                )
              )})`
          )
        )
    );
    if (filas.some((f) => verifyDue(f.lastVerifyAt, now))) vencidas.push(id);
  }
  return vencidas;
}

export function defaultSchedulerDeps(): SchedulerDeps {
  return {
    intervalMin: getEnv().ZOOM_SYNC_INTERVAL_MIN,
    bootDelayMs: 30_000,
    dueOrganizations: (intervalMin) => dueOrganizationsFromDb(intervalMin),
    runOrg: (orgId) => runSync(orgId, "periodica", { userId: null }),
    dueVerifyOrganizations: () => dueVerifyOrganizationsFromDb(),
    verifyOrg: (orgId) => runVerify(orgId, {}),
    log: (m) => console.log(m),
  };
}
