import { and, desc, eq, gte, isNull, lt, notInArray, sql } from "drizzle-orm";
import { getEnv } from "@/lib/env";
import { getDb, schema } from "@/lib/db";
import { newId } from "@/lib/db/ids";
import { scoped } from "@/lib/db/tenant";
import {
  buildPlayUrl,
  listUserRecordings as zoomListUserRecordings,
  ZoomError,
  type ZoomCredentials,
  type ZoomRecordingMeeting,
} from "@/lib/zoom";
import { loadZoomCredentials, sealPasscode, type SealedPasscode } from "./connections";
import { dbLeaseStore, LEASE_MS, leaseOwner, type LeaseStore } from "./lease";
import { inOrgScope } from "./scope";

export type { LeaseStore } from "./lease";

/**
 * 030 US1 (DV-004) — La sincronización de grabaciones.
 *
 * Trae las grabaciones en la nube de los usuarios de Zoom vinculados a un
 * aula ACTIVA (decisión del dueño, DV-012) y las guarda con upsert idempotente
 * por instancia de reunión. Reglas que sostienen todo el diseño:
 *
 *  - **Ninguna transacción abierta durante el HTTP a Zoom.** El adaptador
 *    entrega una página por iteración y cada página se persiste en su propio
 *    alcance corto (`inOrgScope`).
 *  - **Una corrida por organización** (lease, `lease.ts`).
 *  - **`synced_through` solo avanza si TODAS las aulas de la conexión
 *    terminaron bien**: un error deja la ventana como estaba y la próxima
 *    corrida reintenta lo mismo.
 *  - **`executeSync` nunca lanza.** Corre después de que el pedido respondió:
 *    una excepción ahí no tiene a quién llegar, y dejaría el lease tomado
 *    hasta que venza.
 */

const DAY_MS = 86_400_000;
const KEEP_RUNS = 200;

/* ============================================================
 * Tipos y almacenamiento (inyectable: los tests usan uno en memoria)
 * ============================================================ */

export type RecordingUpsert = SealedPasscode & {
  zoomConnectionId: string;
  virtualRoomId: string | null;
  zoomMeetingUuid: string;
  zoomMeetingId: string;
  hostZoomUserId: string;
  hostEmail: string | null;
  topic: string | null;
  startTime: Date;
  durationMin: number | null;
  totalSizeBytes: number | null;
  fileCount: number | null;
  shareUrl: string | null;
  playUrl: string | null;
  passcodeEmbedded: boolean;
  autoDeleteDate: string | null;
};

export type RunStatus = "corriendo" | "ok" | "parcial" | "error";

export interface SyncStore {
  /** Conexiones NO archivadas (opcionalmente, solo una). */
  activeConnections(
    orgId: string,
    connectionId?: string
  ): Promise<{ id: string; name: string; syncedThrough: string | null }[]>;
  /** Aulas ACTIVAS vinculadas a un usuario de esa conexión (DV-012). */
  linkedActiveRooms(orgId: string, connectionId: string): Promise<{ id: string; name: string; zoomUserId: string }[]>;
  createRun(
    orgId: string,
    run: {
      connectionId: string;
      trigger: "manual" | "periodica";
      triggeredBy: string | null;
      windowFrom: string;
      windowTo: string;
    }
  ): Promise<string>;
  /** Devuelve cuántas filas son NUEVAS. */
  upsertRecordings(orgId: string, rows: RecordingUpsert[], seenAt: Date): Promise<number>;
  markMissing(
    orgId: string,
    args: { connectionId: string; roomId: string; from: Date; toExclusive: Date; seenBefore: Date; at: Date }
  ): Promise<void>;
  finishRun(
    orgId: string,
    runId: string,
    result: { status: RunStatus; fetchedCount: number; newCount: number; error: string | null; finishedAt: Date }
  ): Promise<void>;
  setSyncedThrough(orgId: string, connectionId: string, day: string): Promise<void>;
  touchLastSync(orgId: string, connectionId: string, at: Date): Promise<void>;
  pruneRuns(orgId: string, connectionId: string, keep: number): Promise<void>;
}

export type SyncDeps = {
  store: SyncStore;
  lease: LeaseStore;
  zoom: {
    listUserRecordings: (
      creds: ZoomCredentials,
      zoomUserId: string,
      range: { from: string; to: string }
    ) => AsyncGenerator<ZoomRecordingMeeting[]>;
  };
  credentials: (orgId: string, connectionId: string) => Promise<ZoomCredentials>;
  now: () => Date;
  owner: string;
  config: { backfillDays: number; overlapDays: number };
  /** Punto de extensión por página guardada (US2 adjudica acá). */
  afterPage?: (orgId: string, rows: RecordingUpsert[]) => Promise<void>;
};

/* ============================================================
 * Ventana
 * ============================================================ */

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayStart = (day: string) => new Date(`${day}T00:00:00Z`);

/**
 * DV-004 — `from = (synced_through ?? hoy − BACKFILL) − OVERLAP`, `to = hoy`.
 * En UTC y por día: es lo que entiende la API de Zoom.
 */
export function syncWindow(
  syncedThrough: string | null,
  today: Date,
  config: { backfillDays: number; overlapDays: number }
): { from: string; to: string } {
  const hoy = dayStart(today.toISOString().slice(0, 10)).getTime();
  const base = syncedThrough ? dayStart(syncedThrough).getTime() : hoy - config.backfillDays * DAY_MS;
  return { from: isoDay(base - config.overlapDays * DAY_MS), to: isoDay(hoy) };
}

/** DV-008 — Lo que se guarda de una reunión: enlace final y código cifrado. */
export function toUpsert(
  m: ZoomRecordingMeeting,
  connectionId: string,
  roomId: string | null
): RecordingUpsert {
  const play = buildPlayUrl(m);
  return {
    zoomConnectionId: connectionId,
    virtualRoomId: roomId,
    zoomMeetingUuid: m.uuid,
    zoomMeetingId: m.meetingId,
    hostZoomUserId: m.hostId,
    hostEmail: m.hostEmail,
    topic: m.topic,
    startTime: m.startTime,
    durationMin: m.durationMin,
    totalSizeBytes: m.totalSizeBytes,
    fileCount: m.fileCount,
    shareUrl: m.shareUrl,
    playUrl: play.url,
    passcodeEmbedded: play.passcodeEmbedded,
    autoDeleteDate: m.autoDeleteDate,
    ...sealPasscode(m.playPasscode ?? m.password),
  };
}

/* ============================================================
 * Arranque y corrida
 * ============================================================ */

export type SyncPlan = {
  owner: string;
  runs: { runId: string; connectionId: string; window: { from: string; to: string } }[];
};

export type StartResult =
  | { ok: true; plan: SyncPlan }
  | { ok: false; error: "sin_conexiones" }
  | { ok: false; error: "sync_en_curso"; startedAt: Date | null };

/**
 * Toma el lease y crea las corridas. Corre dentro del pedido que la dispara
 * (transacción corta): si el lease está tomado, el botón responde 409 sin
 * haber escrito nada.
 */
export async function startSync(
  orgId: string,
  trigger: "manual" | "periodica",
  opts: { connectionId?: string; userId?: string | null },
  deps: SyncDeps = defaultDeps()
): Promise<StartResult> {
  const conexiones = await deps.store.activeConnections(orgId, opts.connectionId);
  if (conexiones.length === 0) return { ok: false, error: "sin_conexiones" };

  const ahora = deps.now();
  const lease = await deps.lease.acquire(orgId, deps.owner, new Date(ahora.getTime() + LEASE_MS));
  if (!lease.ok) return { ok: false, error: "sync_en_curso", startedAt: lease.startedAt };

  const runs: SyncPlan["runs"] = [];
  for (const c of conexiones) {
    const window = syncWindow(c.syncedThrough, ahora, deps.config);
    const runId = await deps.store.createRun(orgId, {
      connectionId: c.id,
      trigger,
      triggeredBy: opts.userId ?? null,
      windowFrom: window.from,
      windowTo: window.to,
    });
    runs.push({ runId, connectionId: c.id, window });
  }
  return { ok: true, plan: { owner: deps.owner, runs } };
}

/** El mensaje que queda en la bitácora: propio, nunca el crudo de Zoom. */
function motivo(err: unknown): string {
  return err instanceof ZoomError ? err.message : "Error inesperado al sincronizar.";
}

async function runConnection(
  orgId: string,
  run: SyncPlan["runs"][number],
  deps: SyncDeps
): Promise<void> {
  const inicio = deps.now();
  let fetched = 0;
  let nuevas = 0;
  const errores: string[] = [];
  let aulasOk = 0;
  let aulas: { id: string; name: string; zoomUserId: string }[] = [];

  try {
    const creds = await deps.credentials(orgId, run.connectionId);
    aulas = await deps.store.linkedActiveRooms(orgId, run.connectionId);

    for (const aula of aulas) {
      try {
        for await (const page of deps.zoom.listUserRecordings(creds, aula.zoomUserId, run.window)) {
          if (page.length === 0) continue;
          const rows = page.map((m) => toUpsert(m, run.connectionId, aula.id));
          fetched += rows.length;
          nuevas += await deps.store.upsertRecordings(orgId, rows, inicio);
          if (deps.afterPage) await deps.afterPage(orgId, rows);
        }
        // DV-013 — lo que estaba en la ventana y Zoom ya no devolvió.
        await deps.store.markMissing(orgId, {
          connectionId: run.connectionId,
          roomId: aula.id,
          from: dayStart(run.window.from),
          toExclusive: new Date(dayStart(run.window.to).getTime() + DAY_MS),
          seenBefore: inicio,
          at: deps.now(),
        });
        aulasOk++;
      } catch (err) {
        errores.push(`${aula.name}: ${motivo(err)}`);
      }
      await deps.lease
        .renew(orgId, deps.owner, new Date(deps.now().getTime() + LEASE_MS))
        .catch(() => undefined);
    }
  } catch (err) {
    // Credenciales que no abren o la base que no responde: la conexión entera falla.
    errores.push(err instanceof Error && !(err instanceof ZoomError) ? err.message : motivo(err));
  }

  const status: RunStatus =
    errores.length === 0 ? "ok" : aulasOk > 0 ? "parcial" : "error";
  if (status === "ok") await deps.store.setSyncedThrough(orgId, run.connectionId, run.window.to);

  const fin = deps.now();
  await deps.store.finishRun(orgId, run.runId, {
    status,
    fetchedCount: fetched,
    newCount: nuevas,
    error: errores.length > 0 ? errores.join(" · ").slice(0, 2000) : null,
    finishedAt: fin,
  });
  await deps.store.touchLastSync(orgId, run.connectionId, fin);
  await deps.store.pruneRuns(orgId, run.connectionId, KEEP_RUNS);
}

/** Ejecuta las corridas planificadas. NUNCA lanza; siempre libera el lease. */
export async function executeSync(orgId: string, plan: SyncPlan, deps: SyncDeps = defaultDeps()): Promise<void> {
  try {
    for (const run of plan.runs) {
      try {
        await runConnection(orgId, run, deps);
      } catch (err) {
        console.error("[zoom-sync] la corrida de una conexión falló:", err instanceof Error ? err.message : "error");
        await deps.store
          .finishRun(orgId, run.runId, {
            status: "error",
            fetchedCount: 0,
            newCount: 0,
            error: "La sincronización se interrumpió por un error interno.",
            finishedAt: deps.now(),
          })
          .catch(() => undefined);
      }
    }
  } finally {
    await deps.lease.release(orgId, plan.owner).catch(() => undefined);
  }
}

/** Arranque + corrida, para quien no responde a un pedido (temporizador, tests). */
export async function runSync(
  orgId: string,
  trigger: "manual" | "periodica",
  opts: { connectionId?: string; userId?: string | null },
  deps: SyncDeps = defaultDeps()
): Promise<StartResult> {
  const start = await startSync(orgId, trigger, opts, deps);
  if (start.ok) await executeSync(orgId, start.plan, deps);
  return start;
}

/* ============================================================
 * Implementación sobre la base
 * ============================================================ */

const t = schema.zoomRecording;

export const dbSyncStore: SyncStore = {
  activeConnections(orgId, connectionId) {
    return inOrgScope(orgId, () =>
      getDb()
        .select({
          id: schema.zoomConnection.id,
          name: schema.zoomConnection.name,
          syncedThrough: schema.zoomConnection.syncedThrough,
        })
        .from(schema.zoomConnection)
        .where(
          scoped(
            schema.zoomConnection.organizationId,
            orgId,
            isNull(schema.zoomConnection.archivedAt),
            connectionId ? eq(schema.zoomConnection.id, connectionId) : undefined
          )
        )
        .orderBy(schema.zoomConnection.name)
    );
  },
  linkedActiveRooms(orgId, connectionId) {
    return inOrgScope(orgId, async () => {
      const rows = await getDb()
        .select({ id: schema.virtualRoom.id, name: schema.virtualRoom.name, zoomUserId: schema.virtualRoom.zoomUserId })
        .from(schema.virtualRoom)
        .where(
          scoped(
            schema.virtualRoom.organizationId,
            orgId,
            eq(schema.virtualRoom.zoomConnectionId, connectionId),
            isNull(schema.virtualRoom.archivedAt)
          )
        )
        .orderBy(schema.virtualRoom.name);
      return rows.filter((r) => r.zoomUserId).map((r) => ({ id: r.id, name: r.name, zoomUserId: r.zoomUserId! }));
    });
  },
  createRun(orgId, run) {
    return inOrgScope(orgId, async () => {
      const id = newId("zoomSyncRun");
      await getDb().insert(schema.zoomSyncRun).values({
        id,
        organizationId: orgId,
        zoomConnectionId: run.connectionId,
        trigger: run.trigger,
        triggeredBy: run.triggeredBy,
        windowFrom: run.windowFrom,
        windowTo: run.windowTo,
        status: "corriendo",
      });
      return id;
    });
  },
  upsertRecordings(orgId, rows, seenAt) {
    return inOrgScope(orgId, async () => {
      const result = await getDb()
        .insert(t)
        .values(
          rows.map((r) => ({
            ...r,
            id: newId("zoomRecording"),
            organizationId: orgId,
            firstSeenAt: seenAt,
            lastSeenAt: seenAt,
          }))
        )
        .onConflictDoUpdate({
          target: [t.organizationId, t.zoomConnectionId, t.zoomMeetingUuid],
          set: {
            virtualRoomId: sql`excluded.virtual_room_id`,
            zoomMeetingId: sql`excluded.zoom_meeting_id`,
            hostZoomUserId: sql`excluded.host_zoom_user_id`,
            hostEmail: sql`excluded.host_email`,
            topic: sql`excluded.topic`,
            startTime: sql`excluded.start_time`,
            durationMin: sql`excluded.duration_min`,
            totalSizeBytes: sql`excluded.total_size_bytes`,
            fileCount: sql`excluded.file_count`,
            shareUrl: sql`excluded.share_url`,
            playUrl: sql`excluded.play_url`,
            passcodeCipher: sql`excluded.passcode_cipher`,
            passcodeIv: sql`excluded.passcode_iv`,
            passcodeTag: sql`excluded.passcode_tag`,
            passcodeEmbedded: sql`excluded.passcode_embedded`,
            autoDeleteDate: sql`excluded.auto_delete_date`,
            lastSeenAt: sql`excluded.last_seen_at`,
            missingInZoomAt: null,
            updatedAt: new Date(),
          },
        })
        // `xmax = 0` ⇔ la fila la creó ESTE insert (no la actualizó).
        .returning({ inserted: sql<boolean>`(xmax = 0)` });
      return result.filter((r) => r.inserted).length;
    });
  },
  markMissing(orgId, args) {
    return inOrgScope(orgId, async () => {
      await getDb()
        .update(t)
        .set({ missingInZoomAt: args.at, updatedAt: args.at })
        .where(
          scoped(
            t.organizationId,
            orgId,
            and(
              eq(t.zoomConnectionId, args.connectionId),
              eq(t.virtualRoomId, args.roomId),
              gte(t.startTime, args.from),
              lt(t.startTime, args.toExclusive),
              lt(t.lastSeenAt, args.seenBefore),
              isNull(t.missingInZoomAt)
            )
          )
        );
    });
  },
  finishRun(orgId, runId, result) {
    return inOrgScope(orgId, async () => {
      await getDb()
        .update(schema.zoomSyncRun)
        .set(result)
        .where(scoped(schema.zoomSyncRun.organizationId, orgId, eq(schema.zoomSyncRun.id, runId)));
    });
  },
  setSyncedThrough(orgId, connectionId, day) {
    return inOrgScope(orgId, async () => {
      await getDb()
        .update(schema.zoomConnection)
        .set({ syncedThrough: day, updatedAt: new Date() })
        .where(scoped(schema.zoomConnection.organizationId, orgId, eq(schema.zoomConnection.id, connectionId)));
    });
  },
  touchLastSync(orgId, connectionId, at) {
    return inOrgScope(orgId, async () => {
      await getDb()
        .update(schema.zoomConnection)
        .set({ lastSyncAt: at })
        .where(scoped(schema.zoomConnection.organizationId, orgId, eq(schema.zoomConnection.id, connectionId)));
    });
  },
  pruneRuns(orgId, connectionId, keep) {
    return inOrgScope(orgId, async () => {
      const db = getDb();
      const conservar = db
        .select({ id: schema.zoomSyncRun.id })
        .from(schema.zoomSyncRun)
        .where(
          scoped(schema.zoomSyncRun.organizationId, orgId, eq(schema.zoomSyncRun.zoomConnectionId, connectionId))
        )
        .orderBy(desc(schema.zoomSyncRun.startedAt))
        .limit(keep);
      await db
        .delete(schema.zoomSyncRun)
        .where(
          scoped(
            schema.zoomSyncRun.organizationId,
            orgId,
            and(eq(schema.zoomSyncRun.zoomConnectionId, connectionId), notInArray(schema.zoomSyncRun.id, conservar))
          )
        );
    });
  },
};

function defaultDeps(): SyncDeps {
  const env = getEnv();
  return {
    store: dbSyncStore,
    lease: dbLeaseStore,
    zoom: { listUserRecordings: zoomListUserRecordings },
    credentials: (orgId, connectionId) => inOrgScope(orgId, () => loadZoomCredentials(orgId, connectionId)),
    now: () => new Date(),
    owner: leaseOwner(),
    config: { backfillDays: env.ZOOM_SYNC_BACKFILL_DAYS, overlapDays: env.ZOOM_SYNC_OVERLAP_DAYS },
  };
}

/**
 * Las dependencias reales, para la ruta que hace `startSync` en el pedido y
 * `executeSync` después del commit: tienen que compartir el MISMO dueño del
 * lease, o la corrida no podría liberarlo.
 */
export function syncDeps(): SyncDeps {
  return defaultDeps();
}
