import { isNotNull, isNull, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, getRootDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { attendanceFetchDeps, procesarCola } from "./attendance-fetch";
import { inOrgScope } from "./scope";

/**
 * Asistencia sugerida desde Zoom — la periódica, in-process (mismo molde que
 * `scheduler.ts` de grabaciones).
 *
 *  - **`ZOOM_ATTENDANCE_INTERVAL_MIN=0` la apaga** (default) y no arranca en
 *    tests ni en `next build`. El botón "Traer de Zoom" y el de "clases
 *    pasadas" andan igual con la periódica apagada.
 *  - Cada pasada, por organización con Zoom: purga los crudos viejos, ENCOLA
 *    las clases dictadas sin asistencia (incluidas las pasadas: la primera
 *    pasada es el relleno hacia atrás) y trae hasta `ZOOM_ATTENDANCE_BATCH`
 *    clases, con pausa entre clases (los reportes de Zoom son HEAVY).
 *  - El lease es el de la sincronización: nunca corren las dos a la vez.
 *  - Nunca lanza; los temporizadores van con `unref()`.
 */

export type AttendanceSchedulerDeps = {
  intervalMin: number;
  bootDelayMs: number;
  organizations: () => Promise<string[]>;
  runOrg: (orgId: string) => Promise<unknown>;
  log: (msg: string) => void;
};

type State = { timeout: ReturnType<typeof setTimeout>; interval: ReturnType<typeof setInterval> };
const globalForScheduler = globalThis as unknown as { __caditZoomAttendanceScheduler?: State | null };

export function startZoomAttendanceScheduler(
  deps: AttendanceSchedulerDeps = defaultAttendanceSchedulerDeps()
): boolean {
  if (!(deps.intervalMin > 0)) return false;
  if (globalForScheduler.__caditZoomAttendanceScheduler) return false;

  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      let orgs: string[] = [];
      try {
        orgs = await deps.organizations();
      } catch (err) {
        deps.log(`[zoom-asistencia] periódica: no se pudo leer qué traer (${err instanceof Error ? err.name : "error"})`);
      }
      for (const orgId of orgs) {
        try {
          await deps.runOrg(orgId);
        } catch (err) {
          deps.log(`[zoom-asistencia] periódica: ${orgId} falló (${err instanceof Error ? err.name : "error"})`);
        }
      }
    } finally {
      busy = false;
    }
  };

  const timeout = setTimeout(() => void tick(), deps.bootDelayMs);
  timeout.unref?.();
  const interval = setInterval(() => void tick(), deps.intervalMin * 60_000);
  interval.unref?.();
  globalForScheduler.__caditZoomAttendanceScheduler = { timeout, interval };
  deps.log(`[zoom-asistencia] periódica encendida: cada ${deps.intervalMin} min`);
  return true;
}

export function stopZoomAttendanceScheduler(): void {
  const s = globalForScheduler.__caditZoomAttendanceScheduler;
  if (!s) return;
  clearTimeout(s.timeout);
  clearInterval(s.interval);
  globalForScheduler.__caditZoomAttendanceScheduler = null;
}

/** Organizaciones con alguna conexión de Zoom activa. */
export async function organizacionesConZoom(): Promise<string[]> {
  const orgs = await getRootDb().select({ id: schema.organization.id }).from(schema.organization);
  const out: string[] = [];
  for (const { id } of orgs) {
    const filas = await inOrgScope(id, () =>
      getDb()
        .select({ id: schema.zoomConnection.id })
        .from(schema.zoomConnection)
        .where(scoped(schema.zoomConnection.organizationId, id, isNull(schema.zoomConnection.archivedAt)))
        .limit(1)
    );
    if (filas.length > 0) out.push(id);
  }
  return out;
}

/**
 * Al arrancar (aun con la periódica apagada): borra los tramos crudos más
 * viejos que `ZOOM_ATTENDANCE_RAW_DAYS` en las organizaciones que alguna vez
 * trajeron asistencia de Zoom. Lo durable es la marca confirmada.
 */
export async function purgarCrudosAlArrancar(): Promise<void> {
  const deps = attendanceFetchDeps();
  const orgs = await getRootDb().select({ id: schema.organization.id }).from(schema.organization);
  for (const { id } of orgs) {
    try {
      const hay = await inOrgScope(id, () =>
        getDb()
          .select({ x: sql`1` })
          .from(schema.zoomAttendanceFetch)
          .where(scoped(schema.zoomAttendanceFetch.organizationId, id, isNotNull(schema.zoomAttendanceFetch.fetchedAt)))
          .limit(1)
      );
      if (hay.length === 0) continue;
      await deps.store.purgar(id, new Date(Date.now() - deps.config.rawDays * 86_400_000), new Date());
    } catch (err) {
      console.error("[zoom-asistencia] purga al arrancar falló:", err instanceof Error ? err.name : "error");
    }
  }
}

export function defaultAttendanceSchedulerDeps(): AttendanceSchedulerDeps {
  const env = getEnv();
  return {
    intervalMin: env.ZOOM_ATTENDANCE_INTERVAL_MIN,
    bootDelayMs: 60_000,
    organizations: organizacionesConZoom,
    runOrg: (orgId) => procesarCola(orgId, { max: env.ZOOM_ATTENDANCE_BATCH, encolar: true }),
    log: (m) => console.log(m),
  };
}
