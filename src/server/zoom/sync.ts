import { and, desc, eq, gt, gte, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
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
import { applyMatch } from "./assignment";
import { loadZoomCredentials, sealPasscode, type SealedPasscode } from "./connections";
import { loadMatchContext } from "./matching";
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
 *  - **La marca de agua es POR AULA** (`virtual_room.zoom_synced_through`,
 *    research R-12): cada aula pide su propia ventana y solo avanza la suya
 *    si terminó bien. Un aula recién vinculada trae sus 90 días aunque la
 *    conexión se haya sincronizado ayer, y un error deja SU ventana como
 *    estaba. `zoom_connection.synced_through` queda como resumen: avanza
 *    solo si todas las aulas terminaron bien.
 *  - **Sin aulas vinculadas no hay corrida**: no hay nada que traer, así que
 *    tampoco hay nada que dar por sincronizado (`sin_aulas`). Antes la
 *    corrida vacía "terminaba bien" y adelantaba la marca a hoy.
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
  /** Solo metadatos de `recording_files` (`MP4`, `TRANSCRIPT`…). */
  fileTypes: string[];
};

export type RunStatus = "corriendo" | "ok" | "parcial" | "error";

export type PageCounts = { assigned: number; ambiguous: number; conflict: number };

export interface SyncStore {
  /** Conexiones NO archivadas (opcionalmente, solo una). */
  activeConnections(
    orgId: string,
    connectionId?: string
  ): Promise<{ id: string; name: string; syncedThrough: string | null }[]>;
  /** Aulas ACTIVAS vinculadas a un usuario de esa conexión (DV-012), con su marca. */
  linkedActiveRooms(orgId: string, connectionId: string): Promise<SyncRoom[]>;
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
    result: {
      status: RunStatus;
      fetchedCount: number;
      newCount: number;
      assignedCount?: number;
      ambiguousCount?: number;
      conflictCount?: number;
      error: string | null;
      finishedAt: Date;
    }
  ): Promise<void>;
  setSyncedThrough(orgId: string, connectionId: string, day: string): Promise<void>;
  /** R-12 — la marca de UNA aula. */
  setRoomSyncedThrough(orgId: string, roomId: string, day: string): Promise<void>;
  touchLastSync(orgId: string, connectionId: string, at: Date): Promise<void>;
  pruneRuns(orgId: string, connectionId: string, keep: number): Promise<void>;
}

export type SyncRoom = { id: string; name: string; zoomUserId: string; syncedThrough: string | null };

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
  /** Punto de extensión por página guardada: US2 adjudica acá y devuelve los contadores. */
  afterPage?: (orgId: string, rows: RecordingUpsert[]) => Promise<PageCounts | void>;
  /**
   * Re-adjudica las grabaciones automáticas sin clase de la conexión que esta
   * corrida NO tocó (`last_seen_at < seenBefore`): las que quedaron fuera de
   * la ventana pero pueden casar ahora que alguien corrigió el enlace de un
   * aula o generó un cronograma.
   */
  rematch?: (orgId: string, connectionId: string, seenBefore: Date) => Promise<PageCounts>;
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
    fileTypes: m.fileTypes,
    ...sealPasscode(m.playPasscode ?? m.password),
  };
}

/* ============================================================
 * Arranque y corrida
 * ============================================================ */

type Window = { from: string; to: string };

export type SyncPlan = {
  owner: string;
  runs: {
    runId: string;
    connectionId: string;
    /** La ventana más ancha de la corrida (la bitácora). */
    window: Window;
    /** Cada aula con SU ventana (R-12). */
    rooms: (SyncRoom & { window: Window })[];
  }[];
};

export type StartResult =
  | { ok: true; plan: SyncPlan }
  | { ok: false; error: "sin_conexiones" }
  | { ok: false; error: "sin_aulas" }
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
  // Solo las conexiones con aulas: una sin aulas no tiene nada que traer, y
  // una corrida vacía que "termina bien" es justo lo que adelantaba la marca.
  const conAulas: { id: string; rooms: (SyncRoom & { window: Window })[] }[] = [];
  for (const c of conexiones) {
    const aulas = await deps.store.linkedActiveRooms(orgId, c.id);
    if (aulas.length === 0) continue;
    conAulas.push({
      id: c.id,
      rooms: aulas.map((a) => ({ ...a, window: syncWindow(a.syncedThrough, ahora, deps.config) })),
    });
  }
  if (conAulas.length === 0) return { ok: false, error: "sin_aulas" };

  const lease = await deps.lease.acquire(orgId, deps.owner, new Date(ahora.getTime() + LEASE_MS));
  if (!lease.ok) return { ok: false, error: "sync_en_curso", startedAt: lease.startedAt };

  const runs: SyncPlan["runs"] = [];
  for (const c of conAulas) {
    const window = {
      from: c.rooms.map((r) => r.window.from).sort()[0]!,
      to: c.rooms.map((r) => r.window.to).sort().at(-1)!,
    };
    const runId = await deps.store.createRun(orgId, {
      connectionId: c.id,
      trigger,
      triggeredBy: opts.userId ?? null,
      windowFrom: window.from,
      windowTo: window.to,
    });
    runs.push({ runId, connectionId: c.id, window, rooms: c.rooms });
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
  const cuenta: PageCounts = { assigned: 0, ambiguous: 0, conflict: 0 };
  const errores: string[] = [];
  let aulasOk = 0;
  const sumar = (c: PageCounts | void) => {
    if (!c) return;
    cuenta.assigned += c.assigned;
    cuenta.ambiguous += c.ambiguous;
    cuenta.conflict += c.conflict;
  };

  try {
    const creds = await deps.credentials(orgId, run.connectionId);

    for (const aula of run.rooms) {
      try {
        for await (const page of deps.zoom.listUserRecordings(creds, aula.zoomUserId, aula.window)) {
          if (page.length === 0) continue;
          const rows = page.map((m) => toUpsert(m, run.connectionId, aula.id));
          fetched += rows.length;
          nuevas += await deps.store.upsertRecordings(orgId, rows, inicio);
          if (deps.afterPage) sumar(await deps.afterPage(orgId, rows));
        }
        // DV-013 — lo que estaba en la ventana DE ESTA AULA y Zoom ya no devolvió.
        await deps.store.markMissing(orgId, {
          connectionId: run.connectionId,
          roomId: aula.id,
          from: dayStart(aula.window.from),
          toExclusive: new Date(dayStart(aula.window.to).getTime() + DAY_MS),
          seenBefore: inicio,
          at: deps.now(),
        });
        await deps.store.setRoomSyncedThrough(orgId, aula.id, aula.window.to);
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

  // Lo que quedó fuera de la ventana y sigue sin clase: re-adjudicar. Un fallo
  // acá no invalida lo que ya se trajo (las grabaciones están guardadas).
  if (deps.rematch && aulasOk > 0) {
    try {
      sumar(await deps.rematch(orgId, run.connectionId, inicio));
    } catch (err) {
      console.error("[zoom-sync] la re-adjudicación falló:", err instanceof Error ? err.message : "error");
    }
  }

  const status: RunStatus =
    errores.length === 0 ? "ok" : aulasOk > 0 ? "parcial" : "error";
  if (status === "ok") await deps.store.setSyncedThrough(orgId, run.connectionId, run.window.to);

  const fin = deps.now();
  await deps.store.finishRun(orgId, run.runId, {
    status,
    fetchedCount: fetched,
    newCount: nuevas,
    assignedCount: cuenta.assigned,
    ambiguousCount: cuenta.ambiguous,
    conflictCount: cuenta.conflict,
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
        .select({
          id: schema.virtualRoom.id,
          name: schema.virtualRoom.name,
          zoomUserId: schema.virtualRoom.zoomUserId,
          syncedThrough: schema.virtualRoom.zoomSyncedThrough,
        })
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
      return rows
        .filter((r) => r.zoomUserId)
        .map((r) => ({ id: r.id, name: r.name, zoomUserId: r.zoomUserId!, syncedThrough: r.syncedThrough }));
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
            fileTypes: sql`excluded.file_types`,
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
  setRoomSyncedThrough(orgId, roomId, day) {
    return inOrgScope(orgId, async () => {
      await getDb()
        .update(schema.virtualRoom)
        .set({ zoomSyncedThrough: day })
        .where(scoped(schema.virtualRoom.organizationId, orgId, eq(schema.virtualRoom.id, roomId)));
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

/**
 * 030 US2 — Adjudica una página recién guardada: las candidatas se cargan UNA
 * vez para toda la página y cada grabación se adjudica en su propia
 * transacción corta. Las `manual` y las `auto/asignada` ni se miran; las
 * pendientes, ambiguas, en conflicto y sin clase se re-evalúan (alguien pudo
 * haber generado el cronograma o quitado un enlace manual desde la última).
 */
export async function adjudicatePage(orgId: string, rows: RecordingUpsert[]): Promise<PageCounts> {
  const cuenta: PageCounts = { assigned: 0, ambiguous: 0, conflict: 0 };
  if (rows.length === 0) return cuenta;
  const connectionId = rows[0]!.zoomConnectionId;
  const evaluables = await inOrgScope(orgId, () =>
    getDb()
      .select({ id: t.id, startTime: t.startTime })
      .from(t)
      .where(
        scoped(
          t.organizationId,
          orgId,
          eq(t.zoomConnectionId, connectionId),
          inArray(
            t.zoomMeetingUuid,
            rows.map((r) => r.zoomMeetingUuid)
          ),
          eq(t.assignmentMode, "auto"),
          sql`${t.assignmentState} <> 'asignada'`
        )
      )
  );
  if (evaluables.length === 0) return cuenta;

  const tiempos = evaluables.map((e) => e.startTime.getTime());
  const ctx = await inOrgScope(orgId, () =>
    loadMatchContext(orgId, { from: new Date(Math.min(...tiempos)), to: new Date(Math.max(...tiempos)) })
  );
  for (const e of evaluables) {
    const estado = await applyMatch(orgId, e.id, ctx);
    if (estado === "asignada") cuenta.assigned++;
    else if (estado === "ambigua") cuenta.ambiguous++;
    else if (estado === "conflicto") cuenta.conflict++;
  }
  return cuenta;
}

const REMATCH_BATCH = 200;

/**
 * Re-adjudica, por tandas, las grabaciones AUTOMÁTICAS sin clase (pendiente,
 * ambigua, en conflicto, sin clase) de una conexión que la corrida no tocó.
 * Las manuales no se miran nunca: las decidió una persona.
 */
export async function rematchUntouched(orgId: string, connectionId: string, seenBefore: Date): Promise<PageCounts> {
  const cuenta: PageCounts = { assigned: 0, ambiguous: 0, conflict: 0 };
  let despuesDe: { startTime: Date; id: string } | null = null;
  for (;;) {
    const corte: { startTime: Date; id: string } | null = despuesDe;
    const tanda: { id: string; startTime: Date }[] = await inOrgScope(orgId, () =>
      getDb()
        .select({ id: t.id, startTime: t.startTime })
        .from(t)
        .where(
          scoped(
            t.organizationId,
            orgId,
            eq(t.zoomConnectionId, connectionId),
            eq(t.assignmentMode, "auto"),
            sql`${t.assignmentState} <> 'asignada'`,
            lt(t.lastSeenAt, seenBefore),
            corte
              ? or(gt(t.startTime, corte.startTime), and(eq(t.startTime, corte.startTime), gt(t.id, corte.id)))
              : undefined
          )
        )
        .orderBy(t.startTime, t.id)
        .limit(REMATCH_BATCH)
    );
    if (tanda.length === 0) break;
    const tiempos = tanda.map((e) => e.startTime.getTime());
    const ctx = await inOrgScope(orgId, () =>
      loadMatchContext(orgId, { from: new Date(Math.min(...tiempos)), to: new Date(Math.max(...tiempos)) })
    );
    for (const e of tanda) {
      const estado = await applyMatch(orgId, e.id, ctx);
      if (estado === "asignada") cuenta.assigned++;
      else if (estado === "ambigua") cuenta.ambiguous++;
      else if (estado === "conflicto") cuenta.conflict++;
    }
    if (tanda.length < REMATCH_BATCH) break;
    despuesDe = tanda.at(-1)!;
  }
  return cuenta;
}

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
    afterPage: adjudicatePage,
    rematch: rematchUntouched,
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
