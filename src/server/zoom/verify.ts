import { count, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { frenoDeBorradoMasivo } from "@/lib/recording-purge";
import { getDb, schema } from "@/lib/db";
import { scoped } from "@/lib/db/tenant";
import { listUserRecordings as zoomListUserRecordings, ZoomError } from "@/lib/zoom";
import { loadZoomCredentials } from "./connections";
import { dbLeaseStore, LEASE_MS, leaseOwner } from "./lease";
import { purgeMissingOfConnection, reconcileMissing } from "./missing";
import { inOrgScope } from "./scope";
import {
  adjudicatePage,
  dbSyncStore,
  partirPorDuracion,
  toUpsert,
  type SyncDeps,
  type SyncRoom,
  type SyncStore,
} from "./sync";

/**
 * La verificación diaria de grabaciones borradas de Zoom.
 *
 * La sincronización es incremental: solo vuelve a mirar unos días hacia
 * atrás, así que una grabación que alguien borra de Zoom una semana después
 * de traerla no se revisaba nunca más y seguía enlazada a su clase. Una vez
 * por día (y con el botón "Verificar"), esta pasada vuelve a listar
 * `ZOOM_VERIFY_DAYS` días de cada aula y:
 *
 *  1. guarda lo que ve (upsert: lo que aparece EXISTE, y si estaba marcado
 *     como faltante deja de estarlo);
 *  2. SOLO si el listado entero salió bien, marca como faltante lo que estaba
 *     en la ventana y Zoom no devolvió;
 *  3. suelta de su clase las faltantes y restaura las que volvieron
 *     (`missing.ts`);
 *  4. SOLO si el listado entero salió bien, borra las que faltan hace
 *     `ZOOM_MISSING_PURGE_DAYS` días.
 *
 * **Un listado parcial nunca se lee como borrado.** Si falla cualquier
 * página, tramo, aula o conexión (HTTP, límite de tasa, credenciales), la
 * corrida no marca ni borra NADA, en ninguna conexión. Es todo o nada a
 * propósito: el costo de esperar al día siguiente es cero; el de desenlazar
 * una clase por un 429 es una clase sin grabación.
 *
 * Comparte el lease de la sincronización (una corrida por organización, sea
 * cual sea) y su regla: ninguna transacción abierta durante el HTTP a Zoom.
 * `executeVerify` nunca lanza y siempre libera el lease.
 */

const DAY_MS = 86_400_000;
/** "Una vez por día": un tick que llega un poco antes igual cuenta. */
const VERIFY_EVERY_MS = DAY_MS;
const SLACK_MS = 5 * 60_000;
/**
 * El día más viejo de la ventana no se da por borrado: Zoom corta los días
 * con la zona horaria de la cuenta y la ventana se pide en UTC, así que lo
 * que cae en ese borde puede no venir sin haberse borrado.
 */
const MARGIN_DAYS = 1;

export type VerifyStore = Pick<
  SyncStore,
  "activeConnections" | "linkedActiveRooms" | "upsertRecordings" | "touchSeen" | "markMissing"
> & {
  /** Fin de la verificación de una conexión: `error` NULL = completa. */
  setVerified(orgId: string, connectionId: string, at: Date, error: string | null): Promise<void>;
  /**
   * Lo que `markMissing` haría en un aula, sin escribir: `known` = conocidas
   * (no faltantes) en la ventana; `wouldFlag` = las que esta corrida no vio.
   */
  missingCandidates(orgId: string, args: MarkArgs): Promise<{ known: number; wouldFlag: number }>;
};

type MarkArgs = Parameters<SyncStore["markMissing"]>[1];

export type VerifyDeps = Pick<SyncDeps, "lease" | "zoom" | "credentials" | "now" | "owner" | "afterPage"> & {
  store: VerifyStore;
  /** `minRecordingMin`: el MISMO filtro de la sincronización (`partirPorDuracion`). */
  config: { verifyDays: number; purgeDays: number; minRecordingMin?: number };
  reconcile: (orgId: string, connectionId: string) => Promise<unknown>;
  purge: (orgId: string, connectionId: string, purgeDays: number) => Promise<number>;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * `fetch`: lo que se pide a Zoom, [hoy − N, hoy] en días UTC (el adaptador lo
 * parte en tramos de ≤ 30 días). `mark`: dónde se puede dar por borrado lo
 * que no vino — la misma ventana sin su día más viejo.
 */
export function verifyWindow(
  today: Date,
  verifyDays: number
): { fetch: { from: string; to: string }; mark: { from: Date; toExclusive: Date } } {
  const hoy = dayStart(today.toISOString().slice(0, 10)).getTime();
  const desde = hoy - verifyDays * DAY_MS;
  return {
    fetch: { from: isoDay(desde), to: isoDay(hoy) },
    mark: { from: new Date(desde + MARGIN_DAYS * DAY_MS), toExclusive: new Date(hoy + DAY_MS) },
  };
}

/** ¿Toca verificar? Nunca verificada, o la última terminó hace un día o más. */
export function verifyDue(lastVerifyAt: Date | null, now: Date): boolean {
  return lastVerifyAt === null || now.getTime() - lastVerifyAt.getTime() >= VERIFY_EVERY_MS - SLACK_MS;
}

export type VerifyPlan = {
  owner: string;
  startedAt: Date;
  window: ReturnType<typeof verifyWindow>;
  connections: { id: string; name: string; rooms: SyncRoom[] }[];
};

export type VerifyStart =
  | { ok: true; plan: VerifyPlan }
  | { ok: false; error: "sin_conexiones" }
  | { ok: false; error: "sin_aulas" }
  | { ok: false; error: "sync_en_curso"; startedAt: Date | null };

/** Toma el lease (el MISMO de la sincronización) y arma el plan. */
export async function startVerify(
  orgId: string,
  opts: { connectionId?: string },
  deps: VerifyDeps = verifyDeps()
): Promise<VerifyStart> {
  const conexiones = await deps.store.activeConnections(orgId, opts.connectionId);
  if (conexiones.length === 0) return { ok: false, error: "sin_conexiones" };
  const conAulas: VerifyPlan["connections"] = [];
  for (const c of conexiones) {
    const rooms = await deps.store.linkedActiveRooms(orgId, c.id);
    if (rooms.length > 0) conAulas.push({ id: c.id, name: c.name, rooms });
  }
  if (conAulas.length === 0) return { ok: false, error: "sin_aulas" };

  const ahora = deps.now();
  const lease = await deps.lease.acquire(orgId, deps.owner, new Date(ahora.getTime() + LEASE_MS));
  if (!lease.ok) return { ok: false, error: "sync_en_curso", startedAt: lease.startedAt };
  return {
    ok: true,
    plan: { owner: deps.owner, startedAt: ahora, window: verifyWindow(ahora, deps.config.verifyDays), connections: conAulas },
  };
}

/** El mensaje que queda guardado: propio, nunca el crudo de Zoom. */
function motivo(err: unknown): string {
  return err instanceof ZoomError ? err.message : "Error inesperado al verificar.";
}

export type VerifyOutcome = { complete: boolean; fetched: number; purged: number };

/** Ejecuta la verificación planificada. NUNCA lanza; siempre libera el lease. */
export async function executeVerify(orgId: string, plan: VerifyPlan, deps: VerifyDeps = verifyDeps()): Promise<VerifyOutcome> {
  const inicio = plan.startedAt;
  const errores = new Map<string, string[]>();
  const fallo = (connectionId: string, msg: string) =>
    errores.set(connectionId, [...(errores.get(connectionId) ?? []), msg]);
  /** Conexiones con un aula frenada (borrado masivo): no purgan. */
  const frenadas = new Set<string>();
  const avisos = new Map<string, string[]>();
  let fetched = 0;
  let purged = 0;
  let complete = false;

  try {
    // 1. Listar. Todo lo visto se guarda con la marca `inicio`.
    for (const c of plan.connections) {
      try {
        const creds = await deps.credentials(orgId, c.id);
        for (const aula of c.rooms) {
          try {
            for await (const page of deps.zoom.listUserRecordings(creds, aula.zoomUserId, plan.window.fetch)) {
              // Las cortas no se guardan; las que ya estaban se marcan vistas,
              // así no cuentan como borradas ni suman al freno.
              const { guardar, cortas } = partirPorDuracion(page, deps.config.minRecordingMin ?? 0);
              if (cortas.length > 0) {
                await deps.store.touchSeen(orgId, c.id, cortas.map((m) => m.uuid), inicio);
              }
              if (guardar.length === 0) continue;
              const rows = guardar.map((m) => toUpsert(m, c.id, aula.id));
              fetched += rows.length;
              await deps.store.upsertRecordings(orgId, rows, inicio);
              if (deps.afterPage) await deps.afterPage(orgId, rows);
            }
          } catch (err) {
            fallo(c.id, `${aula.name}: ${motivo(err)}`);
          }
          await deps.lease.renew(orgId, deps.owner, new Date(deps.now().getTime() + LEASE_MS)).catch(() => undefined);
        }
      } catch (err) {
        fallo(c.id, motivo(err));
      }
    }

    // 2. Marcar faltantes: SOLO con el listado entero bien, y aula por aula
    //    salvo que el freno de borrado masivo diga que es demasiado.
    let marcado = false;
    if (errores.size === 0) {
      try {
        for (const c of plan.connections) {
          for (const aula of c.rooms) {
            const args: MarkArgs = {
              connectionId: c.id,
              roomId: aula.id,
              from: plan.window.mark.from,
              toExclusive: plan.window.mark.toExclusive,
              seenBefore: inicio,
              at: deps.now(),
            };
            const cand = await deps.store.missingCandidates(orgId, args);
            if (frenoDeBorradoMasivo(cand)) {
              frenadas.add(c.id);
              avisos.set(c.id, [
                ...(avisos.get(c.id) ?? []),
                `El aula ${aula.name} devolvió ${cand.known - cand.wouldFlag} de ${cand.known} grabaciones: no se marcó nada; revisá la conexión o el enlace del aula.`,
              ]);
              continue;
            }
            await deps.store.markMissing(orgId, args);
          }
        }
        marcado = true;
      } catch (err) {
        console.error("[zoom-verify] marcar faltantes falló:", err instanceof Error ? err.message : "error");
        for (const c of plan.connections) fallo(c.id, "No se pudieron marcar las faltantes.");
      }
    }

    // 3. Soltar / restaurar: por estado, seguro aunque la corrida esté incompleta.
    for (const c of plan.connections) {
      try {
        await deps.reconcile(orgId, c.id);
      } catch (err) {
        console.error("[zoom-verify] desvincular faltantes falló:", err instanceof Error ? err.message : "error");
      }
    }

    // 4. Borrar las vencidas: SOLO si esta corrida confirmó el estado de todo,
    //    y nunca en una conexión con un freno puesto.
    if (marcado) {
      complete = frenadas.size === 0;
      for (const c of plan.connections) {
        if (frenadas.has(c.id)) continue;
        try {
          purged += await deps.purge(orgId, c.id, deps.config.purgeDays);
        } catch (err) {
          console.error("[zoom-verify] borrar faltantes falló:", err instanceof Error ? err.message : "error");
        }
      }
    }

    const fin = deps.now();
    for (const c of plan.connections) {
      const propios = errores.get(c.id);
      const frenos = avisos.get(c.id);
      const error = propios
        ? `Verificación incompleta, no se marcó nada: ${propios.join(" · ")}`
        : errores.size > 0
          ? "Verificación incompleta, no se marcó nada: falló otra conexión."
          : frenos
            ? frenos.join(" · ")
            : null;
      await deps.store.setVerified(orgId, c.id, fin, error?.slice(0, 2000) ?? null).catch(() => undefined);
    }
  } catch (err) {
    console.error("[zoom-verify] la verificación falló:", err instanceof Error ? err.message : "error");
    complete = false;
  } finally {
    await deps.lease.release(orgId, plan.owner).catch(() => undefined);
  }
  return { complete, fetched, purged };
}

/** Arranque + corrida, para el temporizador y los tests. */
export async function runVerify(
  orgId: string,
  opts: { connectionId?: string },
  deps: VerifyDeps = verifyDeps()
): Promise<VerifyStart> {
  const start = await startVerify(orgId, opts, deps);
  if (start.ok) await executeVerify(orgId, start.plan, deps);
  return start;
}

/* ============================================================
 * Implementación sobre la base
 * ============================================================ */

export const dbVerifyStore: VerifyStore = {
  activeConnections: dbSyncStore.activeConnections,
  linkedActiveRooms: dbSyncStore.linkedActiveRooms,
  upsertRecordings: dbSyncStore.upsertRecordings,
  touchSeen: dbSyncStore.touchSeen,
  markMissing: dbSyncStore.markMissing,
  missingCandidates(orgId, args) {
    // El MISMO criterio que `markMissing`, contado en lugar de escrito.
    return inOrgScope(orgId, async () => {
      const r = schema.zoomRecording;
      const [row] = await getDb()
        .select({
          known: count(),
          wouldFlag: sql<number>`count(*) filter (where ${r.lastSeenAt} < ${args.seenBefore})`.mapWith(Number),
        })
        .from(r)
        .where(
          scoped(
            r.organizationId,
            orgId,
            eq(r.zoomConnectionId, args.connectionId),
            eq(r.virtualRoomId, args.roomId),
            gte(r.startTime, args.from),
            lt(r.startTime, args.toExclusive),
            isNull(r.missingInZoomAt)
          )
        );
      return { known: row?.known ?? 0, wouldFlag: row?.wouldFlag ?? 0 };
    });
  },
  setVerified(orgId, connectionId, at, error) {
    return inOrgScope(orgId, async () => {
      const c = schema.zoomConnection;
      await getDb()
        .update(c)
        .set({ lastVerifyAt: at, lastVerifyError: error })
        .where(scoped(c.organizationId, orgId, eq(c.id, connectionId)));
    });
  },
};

/**
 * Las dependencias reales. La ruta del botón hace `startVerify` en el pedido
 * y `executeVerify` después del commit: tienen que compartir el MISMO dueño
 * del lease, o la corrida no podría liberarlo.
 */
export function verifyDeps(): VerifyDeps {
  const env = getEnv();
  return {
    store: dbVerifyStore,
    lease: dbLeaseStore,
    zoom: { listUserRecordings: zoomListUserRecordings },
    credentials: (orgId, connectionId) => inOrgScope(orgId, () => loadZoomCredentials(orgId, connectionId)),
    now: () => new Date(),
    owner: leaseOwner(),
    config: {
      verifyDays: env.ZOOM_VERIFY_DAYS,
      purgeDays: env.ZOOM_MISSING_PURGE_DAYS,
      minRecordingMin: env.ZOOM_MIN_RECORDING_MIN,
    },
    afterPage: adjudicatePage,
    reconcile: reconcileMissing,
    purge: purgeMissingOfConnection,
  };
}
